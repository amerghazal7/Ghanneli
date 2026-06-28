# Analytics pipeline: Pub/Sub → BigQuery (Task 5.3)
#
# Flow: app publishes JSON events to the `analytics-events` topic
#       → BQ subscription `events-to-bq` lands raw metadata rows in `events_raw`
#       → the `events` VIEW parses the JSON `data` column into typed columns
#         for Looker Studio dashboards.
#
# DEPLOYMENT WIRING REQUIRED (not managed here):
#   PUBSUB_TOPIC=analytics-events
#   PUBSUB_PROJECT=<project_id>
# Set these env vars on the app (Cloud Run service / .env) so the app publishes
# to the correct topic.  See docs/analytics/dashboards.md for full wiring guide.

# ---------------------------------------------------------------------------
# Pub/Sub topic
# ---------------------------------------------------------------------------

resource "google_pubsub_topic" "analytics_events" {
  name    = "analytics-events"
  project = var.project_id

  depends_on = [google_project_service.svc]
}

# ---------------------------------------------------------------------------
# BigQuery dataset
# ---------------------------------------------------------------------------

resource "google_bigquery_dataset" "analytics" {
  dataset_id  = "ghanneli_analytics"
  location    = "EU"
  project     = var.project_id
  description = "Ghanneli analytics — raw event landing + parsed views"

  depends_on = [google_project_service.svc]
}

# ---------------------------------------------------------------------------
# Landing table (BQ subscription target)
#
# A Pub/Sub BigQuery subscription with write_metadata = true always writes the
# fixed metadata schema: subscription_name, message_id, publish_time, data,
# attributes.  Typed analytical columns live in the `events` view below.
# ---------------------------------------------------------------------------

resource "google_bigquery_table" "events_raw" {
  dataset_id          = google_bigquery_dataset.analytics.dataset_id
  table_id            = "events_raw"
  project             = var.project_id
  deletion_protection = false

  time_partitioning {
    type  = "DAY"
    field = "publish_time"
  }

  schema = file("${path.module}/schemas/events_raw.json")
}

# ---------------------------------------------------------------------------
# Analytical VIEW — parses JSON `data` into typed columns
#
# The app emits camelCase JSON fields; this view maps them to snake_case BQ
# columns.  Money fields (amount_minor, gpu_cost_minor) are INT64 (minor units,
# fils/AED) — never floats.  No PII columns are present.
# ---------------------------------------------------------------------------

resource "google_bigquery_table" "events" {
  dataset_id          = google_bigquery_dataset.analytics.dataset_id
  table_id            = "events"
  project             = var.project_id
  deletion_protection = false

  view {
    use_legacy_sql = false
    query          = <<-EOQ
      SELECT
        publish_time                                                         AS event_time,
        JSON_VALUE(data, '$.type')                                           AS type,
        JSON_VALUE(data, '$.songId')                                         AS song_id,
        JSON_VALUE(data, '$.engineId')                                       AS engine_id,
        JSON_VALUE(data, '$.engineVersion')                                  AS engine_version,
        JSON_VALUE(data, '$.dialect')                                        AS dialect,
        JSON_VALUE(data, '$.genre')                                          AS genre,
        SAFE_CAST(JSON_VALUE(data, '$.latencyMs')    AS INT64)               AS latency_ms,
        SAFE_CAST(JSON_VALUE(data, '$.gpuCostMinor') AS INT64)               AS gpu_cost_minor,
        SAFE_CAST(JSON_VALUE(data, '$.regenerated')  AS BOOL)                AS regenerated,
        SAFE_CAST(JSON_VALUE(data, '$.rating')       AS INT64)               AS rating,
        SAFE_CAST(JSON_VALUE(data, '$.amountMinor')  AS INT64)               AS amount_minor,
        JSON_VALUE(data, '$.currency')                                       AS currency,
        JSON_VALUE(data, '$.sessionId')                                      AS session_id
      FROM `${var.project_id}.ghanneli_analytics.events_raw`
    EOQ
  }

  depends_on = [google_bigquery_table.events_raw]
}

# ---------------------------------------------------------------------------
# Pub/Sub BigQuery subscription
# ---------------------------------------------------------------------------

resource "google_pubsub_subscription" "events_to_bq" {
  name    = "events-to-bq"
  topic   = google_pubsub_topic.analytics_events.id
  project = var.project_id

  bigquery_config {
    table          = "${var.project_id}.${google_bigquery_dataset.analytics.dataset_id}.${google_bigquery_table.events_raw.table_id}"
    write_metadata = true
    # use_topic_schema is intentionally omitted — there is no Avro/Proto schema
    # registered on the topic; JSON is written verbatim into the `data` column.
  }

  depends_on = [
    google_bigquery_table.events_raw,
    google_bigquery_dataset_iam_member.pubsub_sa_bq_editor,
  ]
}

# ---------------------------------------------------------------------------
# IAM: grant the Pub/Sub service agent BigQuery Data Editor on the dataset
#
# The Pub/Sub service agent (service-<project_number>@gcp-sa-pubsub.iam.gserviceaccount.com)
# must hold roles/bigquery.dataEditor on the destination dataset so the BQ
# subscription can write rows.
#
# NOTE: project_number is not a standard Terraform variable here; supply it
# via var.project_number (added to variables.tf).  At deploy time run:
#   terraform apply -var project_number=$(gcloud projects describe <PROJECT_ID> --format='value(projectNumber)')
# ---------------------------------------------------------------------------

resource "google_bigquery_dataset_iam_member" "pubsub_sa_bq_editor" {
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  project    = var.project_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}
