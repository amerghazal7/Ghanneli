resource "google_secret_manager_secret" "s" {
  for_each = toset(["stripe-secret", "anthropic-key", "r2-credentials", "aibackend-token"])

  secret_id = each.value

  replication {
    auto {}
  }
}
