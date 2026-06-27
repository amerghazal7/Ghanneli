locals {
  apis = [
    "run",
    "cloudtasks",
    "pubsub",
    "bigquery",
    "secretmanager",
    "artifactregistry",
  ]
}

resource "google_project_service" "svc" {
  for_each = toset(local.apis)
  service  = "${each.value}.googleapis.com"
}
