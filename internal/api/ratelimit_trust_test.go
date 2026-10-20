package api

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
)

func loginBurst(t *testing.T, h http.Handler, remote string) int {
	t.Helper()
	blocked := 0
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest("POST", "/api/login", nil)
		req.RemoteAddr = remote
		// A different forwarded address on every request: honoring it gives
		// each request a fresh bucket, i.e. no limit at all.
		req.Header.Set("X-Forwarded-For", "203.0.113."+strconv.Itoa(i))
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code == http.StatusTooManyRequests {
			blocked++
		}
	}
	return blocked
}

// X-Forwarded-For is only honored when the immediate peer is a configured
// trusted proxy; from anyone else it must not reset the login bucket.
func TestRateLimitMiddleware_ForwardedForOnlyFromTrustedProxy(t *testing.T) {
	t.Cleanup(func() { setTrustedProxies(nil) })

	newHandler := func() http.Handler {
		rl := NewRateLimiter(60, map[string]int{"login": 2, "search": 100, "download": 100, "api": 100, "default": 100})
		return RateLimitMiddleware(rl, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
	}

	setTrustedProxies(nil)
	if blocked := loginBurst(t, newHandler(), "10.0.0.9:4321"); blocked != 2 {
		t.Fatalf("untrusted peer: spoofed X-Forwarded-For reset the limit (blocked %d of 4, want 2)", blocked)
	}

	setTrustedProxies([]string{"10.0.0.9"})
	if blocked := loginBurst(t, newHandler(), "10.0.0.9:4321"); blocked != 0 {
		t.Fatalf("trusted proxy: forwarded addresses must be distinct identities (blocked %d of 4, want 0)", blocked)
	}
}

func TestRateLimiter_LoginRuleCoversTOTPAndRegister(t *testing.T) {
	rl := NewRateLimiter(60, map[string]int{"login": 5, "api": 100, "default": 600})
	for _, p := range []string{"/api/login", "/api/login/totp", "/api/register"} {
		if got := rl.ruleForPath(p); got != "login" {
			t.Errorf("ruleForPath(%q) = %s, want login", p, got)
		}
	}
}
