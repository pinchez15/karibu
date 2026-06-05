package com.karibuhealth.app.ui.adaptive

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft

/**
 * Clinic + staff chrome shared across Patients and Orders tabs on tablet.
 * On compact phones the OPD screen keeps its inline app bar.
 */
@Composable
fun ClinicalShellAppBar(
    clinicName: String?,
    staff: Staff?,
    profileMenuOpen: Boolean,
    onAvatarClick: () -> Unit,
    onDismissMenu: () -> Unit,
    onSignOut: () -> Unit,
    onOpenWorklists: () -> Unit,
    onOpenBilling: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                horizontal = KaribuLayout.contentPaddingHorizontal(),
                vertical = 8.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            KhMetaText(text = (clinicName ?: "Karibu Health").uppercase())
            Spacer(Modifier.height(2.dp))
            Text(
                text = staff?.displayName ?: "—",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        IconButton(onClick = onOpenBilling) {
            Icon(
                imageVector = Icons.Default.Payments,
                contentDescription = "Billing",
                tint = Cobalt,
            )
        }

        IconButton(onClick = onOpenWorklists) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.List,
                contentDescription = "Worklists",
                tint = Cobalt,
            )
        }

        Box {
            ShellProfileAvatar(staff = staff, onClick = onAvatarClick)
            ShellProfileMenu(
                expanded = profileMenuOpen,
                staff = staff,
                clinicName = clinicName,
                onDismiss = onDismissMenu,
                onSignOut = onSignOut,
            )
        }
    }
}

@Composable
private fun ShellProfileAvatar(staff: Staff?, onClick: () -> Unit) {
    val initials = staff?.displayName?.split(" ")
        ?.mapNotNull { it.firstOrNull()?.uppercaseChar() }
        ?.take(2)
        ?.joinToString("")
        ?.ifBlank { null } ?: "?"
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(CobaltSoft)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = MaterialTheme.typography.labelLarge,
            color = Cobalt,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun ShellProfileMenu(
    expanded: Boolean,
    staff: Staff?,
    clinicName: String?,
    onDismiss: () -> Unit,
    onSignOut: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(
                text = staff?.displayName ?: "—",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = staff?.role?.name?.replace('_', ' ')?.replaceFirstChar { it.titlecase() }
                    ?: "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            clinicName?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text("Sign out") },
            leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null) },
            onClick = onSignOut,
        )
    }
}
