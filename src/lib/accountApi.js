import { API_BASE_URL, authHeaders, handleResponse } from "@/lib/apiClient";

/**
 * Permanently delete the signed-in user's application data (Market Thirteen
 * #5 — data deletion request flow). Cancels active Stripe subscriptions
 * best-effort and cascade-deletes every owned row. The Clerk login identity
 * is retained — see the privacy policy for full identity removal.
 */
export async function deleteMyAccount() {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE_URL}/api/users/me`, {
    method: "DELETE",
    headers,
  });
  return handleResponse(response, "Account deletion failed. Please contact support.");
}
