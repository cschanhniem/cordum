package llmchat

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// ApiUnauthorizedError is returned when the gateway responds 401. It
// carries the gateway's error code (when parseable) so the upstream LLM
// can narrate the failure cause to the user.
type ApiUnauthorizedError struct {
	Code string
	Body string
}

func (e *ApiUnauthorizedError) Error() string {
	return formatAPIError("unauthorized", http.StatusUnauthorized, e.Code, e.Body)
}

// ApiForbiddenError is returned for 403 responses.
type ApiForbiddenError struct {
	Code string
	Body string
}

func (e *ApiForbiddenError) Error() string {
	return formatAPIError("forbidden", http.StatusForbidden, e.Code, e.Body)
}

// ApiNotFoundError is returned for 404 responses.
type ApiNotFoundError struct {
	Code string
	Body string
}

func (e *ApiNotFoundError) Error() string {
	return formatAPIError("not found", http.StatusNotFound, e.Code, e.Body)
}

// ApiClientError is returned for 4xx codes that don't have a more
// specific typed variant (400, 409, 422, 429, etc.).
type ApiClientError struct {
	StatusCode int
	Code       string
	Body       string
}

func (e *ApiClientError) Error() string {
	return formatAPIError("client error", e.StatusCode, e.Code, e.Body)
}

// ApiServerError is returned for 5xx after retry exhaustion.
type ApiServerError struct {
	StatusCode int
	Code       string
	Body       string
}

func (e *ApiServerError) Error() string {
	return formatAPIError("server error", e.StatusCode, e.Code, e.Body)
}

// classify4xx parses a 4xx response body and returns the typed error
// matching the status code. Body is preserved (truncated) so callers can
// debug without re-issuing the request.
func classify4xx(status int, body []byte) error {
	code := extractErrorCode(body)
	bodyPreview := truncate(strings.TrimSpace(string(body)), 1024)
	switch status {
	case http.StatusUnauthorized:
		return &ApiUnauthorizedError{Code: code, Body: bodyPreview}
	case http.StatusForbidden:
		return &ApiForbiddenError{Code: code, Body: bodyPreview}
	case http.StatusNotFound:
		return &ApiNotFoundError{Code: code, Body: bodyPreview}
	default:
		return &ApiClientError{StatusCode: status, Code: code, Body: bodyPreview}
	}
}

// extractErrorCode tries the gateway's two error envelope shapes:
//
//	{"error": "msg"}            // legacy / writeErrorJSON
//	{"error": {"code": "..."}}  // structured
//
// Returning empty string is fine — the body is still attached to the
// typed error.
func extractErrorCode(body []byte) string {
	body = []byte(strings.TrimSpace(string(body)))
	if len(body) == 0 {
		return ""
	}
	var structured struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &structured); err == nil && structured.Error.Code != "" {
		return structured.Error.Code
	}
	var simple struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &simple); err == nil && simple.Error != "" {
		return simple.Error
	}
	return ""
}

func formatAPIError(label string, status int, code, body string) string {
	if code != "" {
		return fmt.Sprintf("llmchat/apiclient: %s (status=%d code=%q)", label, status, code)
	}
	if body != "" {
		return fmt.Sprintf("llmchat/apiclient: %s (status=%d body=%q)", label, status, truncate(body, 256))
	}
	return fmt.Sprintf("llmchat/apiclient: %s (status=%d)", label, status)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
