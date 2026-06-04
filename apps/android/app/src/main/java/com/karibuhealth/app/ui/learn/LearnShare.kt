package com.karibuhealth.app.ui.learn

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.karibuhealth.app.ui.learn.model.LearnCase

/**
 * WhatsApp-style case sharing (case-content-strategy.md → Sharing).
 *
 * Karibu Learn leans into existing peer-learning behaviour: a case can be
 * shared as a short, discussion-friendly teaser. We build plain text (no emoji,
 * per brand) from the case's [com.karibuhealth.app.ui.learn.model.ShareMeta]
 * and hand it to the system chooser, which surfaces WhatsApp et al. Learner
 * progress is never included.
 */
fun shareText(case: LearnCase): String {
    val s = case.share
    return buildString {
        appendLine(s?.shareTitle?.takeIf { it.isNotBlank() } ?: case.title)
        s?.sharePrompt?.takeIf { it.isNotBlank() }?.let { appendLine(); appendLine(it) }
        s?.discussionQuestion?.takeIf { it.isNotBlank() }?.let { appendLine(); appendLine(it) }
        s?.shareUrl?.takeIf { it.isNotBlank() }?.let { appendLine(); append(it) }
    }.trim()
}

fun shareCase(context: Context, case: LearnCase) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, case.share?.shareTitle ?: case.title)
        putExtra(Intent.EXTRA_TEXT, shareText(case))
    }
    context.startActivity(Intent.createChooser(send, "Share case"))
}

/** Ghost "Share with a group" button shown when a case ships share artifacts. */
@Composable
fun ShareCaseButton(case: LearnCase, modifier: Modifier = Modifier) {
    if (case.share == null) return
    val context = LocalContext.current
    KlButton(
        text = "Share with a group",
        onClick = { shareCase(context, case) },
        modifier = modifier,
        kind = KlBtnKind.Ghost,
        leadingIcon = KlIcons.share,
    )
}
