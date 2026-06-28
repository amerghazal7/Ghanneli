# Cloud production engine wiring. The GPU serving itself runs on the cloud
# provider (Modal, see ai-backend/modal_app.py) — not GCP — so Terraform's job
# here is only to hold the endpoint URL + bearer token as secrets that Cloud Run
# injects into the App as CLOUD_ENGINE_URL / CLOUD_ENGINE_TOKEN (read by
# app/src/server/services/music/config.ts). Values are added out-of-band as
# secret versions after `modal deploy` prints the endpoint URL.

resource "google_secret_manager_secret" "cloud_engine" {
  for_each  = toset(["cloud-engine-url", "cloud-engine-token"])
  secret_id = each.value
  replication {
    auto {}
  }
}
