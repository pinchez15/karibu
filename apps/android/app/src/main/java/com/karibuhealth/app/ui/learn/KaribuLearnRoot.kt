package com.karibuhealth.app.ui.learn

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.runtime.collectAsState
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.learn.walkthrough.WalkthroughScreen

/**
 * KaribuLearn — the free CME app. A distinct coral product that shares
 * KaribuEHR's bones but never its skin. Embedded here as a full-screen surface
 * launched from the EHR; in time it can graduate to its own APK with no UI
 * change, since it owns its chrome and navigation.
 */
private sealed interface LearnNav {
    data object Welcome : LearnNav
    data class Tabs(val tab: LearnTab) : LearnNav
    data class Landing(val case: LearnCase) : LearnNav
    data class Walk(val case: LearnCase) : LearnNav
    data class Complete(val case: LearnCase, val score: Int, val total: Int) : LearnNav
}

@Composable
fun KaribuLearnRoot(
    onExit: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LearnViewModel = hiltViewModel(),
    palette: KlPalette = CoralPalette,
) {
    val state by viewModel.uiState.collectAsState()
    var nav by remember { mutableStateOf<LearnNav>(LearnNav.Welcome) }

    CompositionLocalProvider(LocalKl provides palette) {
        Box(modifier.fillMaxSize().background(palette.bg).systemBarsPadding()) {
            when (val n = nav) {
                is LearnNav.Welcome -> {
                    BackHandler(onBack = onExit)
                    WelcomeScreen(
                        caseCount = state.cases.size,
                        topicCount = state.cases.map { it.topic }.distinct().size,
                        onEnter = { nav = LearnNav.Tabs(LearnTab.Home) },
                    )
                }

                is LearnNav.Tabs -> {
                    BackHandler { if (n.tab == LearnTab.Home) onExit() else nav = LearnNav.Tabs(LearnTab.Home) }
                    TabsScaffold(
                        tab = n.tab,
                        state = state,
                        onSelectTab = { nav = LearnNav.Tabs(it) },
                        onOpenCase = { nav = LearnNav.Landing(it) },
                        onDownload = viewModel::downloadPack,
                        onRemove = viewModel::removePack,
                    )
                }

                is LearnNav.Landing -> CaseLandingScreen(
                    case = n.case,
                    onBegin = { c -> if (c.steps.isNotEmpty()) nav = LearnNav.Walk(c) },
                    onBack = { nav = LearnNav.Tabs(LearnTab.Library) },
                )

                is LearnNav.Walk -> WalkthroughScreen(
                    case = n.case,
                    showTeaching = true,
                    onExit = { nav = LearnNav.Landing(n.case) },
                    onComplete = { score, total -> nav = LearnNav.Complete(n.case, score, total) },
                )

                is LearnNav.Complete -> CaseCompleteScreen(
                    case = n.case, score = n.score, total = n.total,
                    onLibrary = { nav = LearnNav.Tabs(LearnTab.Library) },
                )
            }
        }
    }
}

@Composable
private fun TabsScaffold(
    tab: LearnTab,
    state: LearnUiState,
    onSelectTab: (LearnTab) -> Unit,
    onOpenCase: (LearnCase) -> Unit,
    onDownload: (com.karibuhealth.app.ui.learn.model.PackInfo) -> Unit,
    onRemove: (com.karibuhealth.app.ui.learn.model.PackInfo) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        when (tab) {
            LearnTab.Home -> KlAppBar(title = "KaribuLearn", sub = "Continuing education", showMark = true)
            LearnTab.Library -> KlAppBar(title = "Case library")
            LearnTab.Progress -> KlAppBar(title = "My progress")
            LearnTab.About -> KlAppBar(title = "About KaribuLearn")
        }
        Box(Modifier.weight(1f).fillMaxSize()) {
            when {
                state.isLoading -> KlLoading()
                else -> when (tab) {
                    LearnTab.Home -> HomeScreen(state.cases, onOpenCase, onSeeAll = { onSelectTab(LearnTab.Library) })
                    LearnTab.Library -> LibraryScreen(
                        cases = state.cases, packs = state.packs, downloading = state.downloading,
                        onOpenCase = onOpenCase, onDownload = onDownload, onRemove = onRemove,
                    )
                    LearnTab.Progress -> ProgressScreen(state.cases)
                    LearnTab.About -> AboutScreen()
                }
            }
        }
        KlTabBar(active = tab, onSelect = onSelectTab)
    }
}
