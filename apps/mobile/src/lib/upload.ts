import * as FileSystem from 'expo-file-system';
import { getUploadUrl, confirmAudioUpload, updateVisitStatus, createAudioUpload } from './api';
import { useVisitStore } from '../stores/visitStore';

interface UploadResult {
  success: boolean;
  error?: string;
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = INITIAL_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[Upload] ${operationName} failed (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        lastError.message
      );

      if (attempt < MAX_RETRIES - 1) {
        const delay = getBackoffDelay(attempt);
        console.log(`[Upload] Retrying ${operationName} in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export async function uploadAudioFile(
  visitId: string,
  localFilePath: string,
  durationSeconds: number,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  try {
    // Create audio upload record (idempotent - will return existing if present)
    await withRetry(
      () => createAudioUpload(visitId),
      'createAudioUpload'
    );

    // Update visit status
    await withRetry(
      () => updateVisitStatus(visitId, 'uploading'),
      'updateVisitStatus'
    );

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(localFilePath);
    if (!fileInfo.exists) {
      return { success: false, error: 'Recording file not found' };
    }

    const fileSizeBytes = fileInfo.size || 0;

    // Get signed upload URL (with retry)
    const { uploadUrl, storagePath } = await withRetry(
      () => getUploadUrl(visitId),
      'getUploadUrl'
    );

    // Upload file (with retry)
    const uploadResult = await withRetry(async () => {
      const result = await FileSystem.uploadAsync(uploadUrl, localFilePath, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': 'audio/m4a',
        },
      });

      if (result.status !== 200 && result.status !== 201) {
        throw new Error(`Upload failed with status ${result.status}`);
      }

      return result;
    }, 'uploadFile');

    // Confirm upload (with retry)
    await withRetry(
      () => confirmAudioUpload(visitId, storagePath, durationSeconds, fileSizeBytes),
      'confirmAudioUpload'
    );

    // Delete local file after successful upload
    await FileSystem.deleteAsync(localFilePath, { idempotent: true });

    return { success: true };
  } catch (error) {
    console.error('[Upload] Upload error after all retries:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

// Process pending uploads queue
export async function processPendingUploads(): Promise<void> {
  const store = useVisitStore.getState();
  const { pendingUploads, removePendingUpload, updatePendingUpload, isOnline, setLastSyncAt } = store;

  if (!isOnline || pendingUploads.length === 0) {
    console.log('[Upload] Skipping pending uploads - offline or no pending items');
    return;
  }

  console.log(`[Upload] Processing ${pendingUploads.length} pending uploads...`);

  for (const visit of pendingUploads) {
    // Re-check online status before each upload
    const currentStore = useVisitStore.getState();
    if (!currentStore.isOnline) {
      console.log('[Upload] Went offline during processing, stopping');
      break;
    }

    if (!visit.audio_local_path || visit.audio_uploaded) {
      // Already uploaded or no audio path - remove from queue
      if (visit.audio_uploaded) {
        console.log(`[Upload] Visit ${visit.id} already uploaded, removing from queue`);
        removePendingUpload(visit.local_id);
      }
      continue;
    }

    try {
      console.log(`[Upload] Uploading visit ${visit.id}...`);
      const result = await uploadAudioFile(
        visit.id,
        visit.audio_local_path,
        visit.recordingDuration ?? store.recordingDuration
      );

      if (result.success) {
        console.log(`[Upload] Visit ${visit.id} uploaded successfully`);
        // Remove from pending queue after successful upload
        removePendingUpload(visit.local_id);
      } else {
        console.error(`[Upload] Failed to upload visit ${visit.id}:`, result.error);
        // Update with error info but keep in queue for retry
        updatePendingUpload(visit.local_id, {
          lastError: result.error,
          lastAttempt: new Date().toISOString(),
        } as Partial<typeof visit>);
      }
    } catch (error) {
      console.error(`[Upload] Error processing visit ${visit.id}:`, error);
    }
  }

  // Update last sync timestamp
  setLastSyncAt(new Date().toISOString());
  console.log('[Upload] Finished processing pending uploads');
}
