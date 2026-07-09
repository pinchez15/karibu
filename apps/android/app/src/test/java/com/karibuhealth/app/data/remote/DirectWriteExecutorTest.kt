package com.karibuhealth.app.data.remote

import com.karibuhealth.app.data.sync.TokenRefresher
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class DirectWriteExecutorTest {

    private lateinit var tokenRefresher: TokenRefresher
    private lateinit var executor: DirectWriteExecutor

    @Before
    fun setup() {
        tokenRefresher = mockk()
        executor = DirectWriteExecutor(tokenRefresher)
    }

    @Test
    fun non401PassesThrough() = runTest {
        val serverError = Response.error<String>(500, "err".toResponseBody())
        var calls = 0

        val result = executor.run {
            calls++
            serverError
        }

        assertEquals(500, result.code())
        assertEquals(1, calls)
        coVerify(exactly = 0) { tokenRefresher.refreshToken() }
    }

    @Test
    fun on401RefreshesAndRetriesOnce() = runTest {
        coEvery { tokenRefresher.refreshToken() } returns true
        var calls = 0

        val result = executor.run {
            calls++
            if (calls == 1) {
                Response.error(401, "".toResponseBody())
            } else {
                Response.success("ok")
            }
        }

        assertTrue(result.isSuccessful)
        assertEquals(2, calls)
        coVerify(exactly = 1) { tokenRefresher.refreshToken() }
    }

    @Test
    fun on401RefreshFailureReturnsOriginal() = runTest {
        val unauthorized = Response.error<String>(401, "".toResponseBody())
        coEvery { tokenRefresher.refreshToken() } returns false
        var calls = 0

        val result = executor.run {
            calls++
            unauthorized
        }

        assertEquals(401, result.code())
        assertEquals(1, calls)
        coVerify(exactly = 1) { tokenRefresher.refreshToken() }
    }
}
