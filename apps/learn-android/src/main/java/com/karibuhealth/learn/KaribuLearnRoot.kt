package com.karibuhealth.learn

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.runtime.collectAsState
import com.karibuhealth.learn.data.PackStatus
import com.karibuhealth.learn.data.supabase.LearnAuthRepository
import com.karibuhealth.learn.model.LearnCase
import com.karibuhealth.learn.ui.auth.LearnAuthScreen
import com.karibuhealth.learn.walkthrough.WalkthroughScreen

/** Karibu Learn root navigation — standalone app (`apps/learn-android`). */
private sealed interface LearnNav {
    data object Welcome : LearnNav
    data object Auth : LearnNav
    data class Tabs(val tab: LearnTab) : LearnNav
    data class Landing(val case: LearnCase) : LearnNav
    data class Walk(val case: LearnCase) : LearnNav
    data class Complete(val case: LearnCase, val score: Int, val total: Int) : LearnNav
}

@Composable
fun KaribuLearnRoot(
    onExit: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LearnViewModel,
    authRepository: LearnAuthRepository,
    palette: KlPalette = CoralPalette,
) {
    val state by viewModel.uiState.collectAsState()
    val progress by viewModel.progressState.collectAsState()
    var nav by remember { mutableStateOf<LearnNav>(LearnNav.Welcome) }

    CompositionLocalProvider(LocalKl provides palette) {
        Box(modifier.fillMaxSize().background(palette.bg).systemBarsPadding()) {
            when (val n = nav) {
                is LearnNav.Welcome -> {
                    BackHandler(onBack = onExit)
                    WelcomeScreen(
                        caseCount = state.catalogCaseCount,
                        topicCount = state.catalogTopicCount,
                        onBrowse = { nav = LearnNav.Tabs(LearnTab.Home) },
                        onSignIn = { nav = LearnNav.Auth },
                    )
                }

                is LearnNav.Auth -> {
                    BackHandler { nav = LearnNav.Welcome }
                    LearnAuthScreen(
                        authRepository = authRepository,
                        onBack = { nav = LearnNav.Welcome },
                        onSignedIn = {
                            viewModel.refreshProgress()
                            nav = LearnNav.Tabs(LearnTab.Progress)
                        },
                    )
                }

                is LearnNav.Tabs -> {
                    BackHandler { if (n.tab == LearnTab.Home) onExit() else nav = LearnNav.Tabs(LearnTab.Home) }
                    TabsScaffold(
                        tab = n.tab,
                        state = state,
                        progress = progress,
                        onSelectTab = { tab ->
                            if (tab == LearnTab.Progress && !progress.isSignedIn) {
                                nav = LearnNav.Auth
                            } else {
                                nav = LearnNav.Tabs(tab)
                                if (tab == LearnTab.Progress) viewModel.refreshProgress()
                            }
                        },
                        onOpenCase = { nav = LearnNav.Landing(it) },
                        onDownload = viewModel::downloadPack,
                        onRemove = viewModel::removePack,
                        onSignIn = { nav = LearnNav.Auth },
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

                is LearnNav.Complete -> {
                    LaunchedEffect(n.case.id, n.score, n.total) {
                        viewModel.recordCaseCompletion(n.case, n.score, n.total)
                    }
                    CaseCompleteScreen(
                        case = n.case, score = n.score, total = n.total,
                        isSignedIn = progress.isSignedIn,
                        onSubmitCorrection = { message, onResult ->
                            viewModel.submitCaseCorrection(n.case, message, onResult)
                        },
                        onLibrary = { nav = LearnNav.Tabs(LearnTab.Library) },
                    )
                }
            }
        }
    }
}

@Composable
private fun TabsScaffold(
    tab: LearnTab,
    state: LearnUiState,
    progress: LearnProgressUiState,
    onSelectTab: (LearnTab) -> Unit,
    onOpenCase: (LearnCase) -> Unit,
    onDownload: (com.karibuhealth.learn.model.PackInfo) -> Unit,
    onRemove: (com.karibuhealth.learn.model.PackInfo) -> Unit,
    onSignIn: () -> Unit,
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
                    LearnTab.Home -> HomeScreen(
                        cases = state.cases,
                        progress = progress,
                        installedPackCount = state.packs.count { it.status == PackStatus.Installed },
                        catalogCaseCount = state.catalogCaseCount,
                        catalogTopicCount = state.catalogTopicCount,
                        onOpenCase = onOpenCase,
                        onSeeAll = { onSelectTab(LearnTab.Library) },
                    )
                    LearnTab.Library -> LibraryScreen(
                        cases = state.cases, packs = state.packs, downloading = state.downloading,
                        onOpenCase = onOpenCase, onDownload = onDownload, onRemove = onRemove,
                    )
                    LearnTab.Progress -> ProgressScreen(
                        cases = state.cases,
                        progress = progress,
                        onSignIn = onSignIn,
                    )
                    LearnTab.About -> AboutScreen()
                }
            }
        }
        KlTabBar(active = tab, onSelect = onSelectTab)
    }
}
