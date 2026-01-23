import * as FileSystem from 'expo-file-system';
import { getUploadUrl, confirmAudioUpload, updateVisitStatus, createAudioUpload } from './api';
import { useVisitStore } from '../stores/visitStore';

interface UploadResult {
  success: boolean;
  error?: string;
}

export async function uploadAudioFile(
  visitId: string,
  localFilePath: string,
  durationSeconds: number,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  try {
    // Create audio upload record
    await createAudioUpload(visitId);

    // Update visit status
    await updateVisitStatus(visitId, 'uploading');

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(localFilePath);
    if (!fileInfo.exists) {
      return { success: false, error: 'Recording file not found' };
    }

    const fileSizeBytes = fileInfo.size || 0;

    // Get signed upload URL
    const { uploadUrl, storagePath } = await getUploadUrl(visitId);

    // Upload file
    const uploadResult = await FileSystem.uploadAsync(uploadUrl, localFilePath, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': 'audio/m4a',
      },
    });

    if (uploadResult.status !== 200 && uploadResult.status !== 201) {
      return { success: false, error: `Upload failed with status ${uploadResult.status}` };
    }

    // Confirm upload
    await confirmAudioUpload(visitId, storagePath, durationSeconds, fileSizeBytes);

    // Delete local file after successful upload
    await FileSystem.deleteAsync(localFilePath, { idempotent: true });

    return { success: true };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

// Process pending uploads queue
export async function processPendingUploads(): Promise<void> {
  const store = useVisitStore.getState();
  const { pendingUploads, removePendingUpload, updatePendingUpload, isOnline } = store;

  if (!isOnline || pendingUploads.length === 0) {
    return;
  }

  for (const visit of pendingUploads) {
    if (!visit.audio_local_path || visit.audio_uploaded) {
      continue;
    }

    try {
      const result = await uploadAudioFile(
        visit.id,
        visit.audio_local_path,
        store.recordingDuration
      );

      if (result.success) {
        updatePendingUpload(visit.local_id, {
          audio_uploaded: true,
          synced: true,
        });
      } else {
        console.error('Failed to upload pending:', result.error);
      }
    } catch (error) {
      console.error('Error processing pending upload:', error);
    }
  }
}
