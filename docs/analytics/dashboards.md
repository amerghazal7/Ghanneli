# Ghanneli Analytics Dashboards

Analytics pipeline: app → Pub/Sub (`analytics-events`) → BQ subscription (`events-to-bq`) → landing table `events_raw` → parsed view `events` → Looker Studio dashboards.

---

## Deployment wiring

Before the pipeline can ingest events you must set two environment variables on the **app** (Cloud Run service or local `.env`):

| Variable | Value |
|---|---|
| `PUBSUB_TOPIC` | `analytics-events` |
| `PUBSUB_PROJECT` | `<your GCP project ID>` |

The app defaults `PUBSUB_TOPIC` to `ghanneli-analytics`; without the override events are published to the wrong topic and the BQ subscription receives nothing.

The Pub/Sub service agent (`service-<project_number>@gcp-sa-pubsub.iam.gserviceaccount.com`) is granted `roles/bigquery.dataEditor` on the `ghanneli_analytics` dataset by Terraform. Pass the project number at apply time:

```
terraform apply -var project_number=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')
```

---

## Data model

### Landing table — `ghanneli_analytics.events_raw`

Populated directly by the BQ subscription (`write_metadata = true`). Schema is fixed by GCP:

| Column | Type | Notes |
|---|---|---|
| `subscription_name` | STRING | Pub/Sub subscription that delivered the message |
| `message_id` | STRING | Pub/Sub message ID |
| `publish_time` | TIMESTAMP | Partition column (DAY) |
| `data` | STRING | Base64-decoded JSON payload from the app |
| `attributes` | STRING | JSON-serialised Pub/Sub message attributes |

### Analytical view — `ghanneli_analytics.events`

Parses the `data` JSON into typed columns. All dashboards query this view.

```sql
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
FROM `<project_id>.ghanneli_analytics.events_raw`
```

#### camelCase → column mapping

| App JSON field | BQ column | Type | Notes |
|---|---|---|---|
| `type` | `type` | STRING | Event name, e.g. `wizard_started` |
| `songId` | `song_id` | STRING | |
| `engineId` | `engine_id` | STRING | |
| `engineVersion` | `engine_version` | STRING | |
| `dialect` | `dialect` | STRING | |
| `genre` | `genre` | STRING | |
| `latencyMs` | `latency_ms` | INT64 | ms |
| `gpuCostMinor` | `gpu_cost_minor` | INT64 | Integer minor units (fils) |
| `regenerated` | `regenerated` | BOOL | |
| `rating` | `rating` | INT64 | 1–5 |
| `amountMinor` | `amount_minor` | INT64 | Integer minor units (fils, AED) |
| `currency` | `currency` | STRING | e.g. `aed` |
| `sessionId` | `session_id` | STRING | Optional |

Money columns (`amount_minor`, `gpu_cost_minor`) are **always integer minor units (fils)**. Currency is AED (1 AED = 100 fils). Never floats.

No PII is present. The event contract deliberately excludes user-identifying fields.

---

## Dashboard 1 — Behavior / Funnel

**Purpose:** Track wizard completion, preview generation, purchase conversion, and rating engagement.

**Looker Studio source:** `ghanneli_analytics.events` (date range filter on `event_time`)

### Backing SQL

```sql
-- Funnel step counts + conversion rates
SELECT
  COUNTIF(type = 'wizard_started')       AS wizard_started,
  COUNTIF(type = 'preview_generated')    AS preview_generated,
  COUNTIF(type = 'purchase_completed')   AS purchase_completed,
  COUNTIF(type = 'song_rated')           AS song_rated,

  SAFE_DIVIDE(
    COUNTIF(type = 'preview_generated'),
    COUNTIF(type = 'wizard_started')
  ) * 100                                AS wizard_to_preview_pct,

  SAFE_DIVIDE(
    COUNTIF(type = 'purchase_completed'),
    COUNTIF(type = 'preview_generated')
  ) * 100                                AS preview_to_purchase_pct,

  SAFE_DIVIDE(
    COUNTIF(type = 'song_rated'),
    COUNTIF(type = 'purchase_completed')
  ) * 100                                AS purchase_to_rated_pct

FROM `<project_id>.ghanneli_analytics.events`
WHERE event_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
```

**Charts to build:**
- Funnel chart: wizard_started → preview_generated → purchase_completed
- Scorecard tiles: each count + conversion %
- Time-series line: daily wizard_started and purchase_completed

---

## Dashboard 2 — Engine Quality Heatmap

**Purpose:** Engine flywheel signal — identify which dialect × genre × engine_version combinations produce the highest user ratings and lowest latency.

**Looker Studio source:** `ghanneli_analytics.events`

### Backing SQL

```sql
-- Dialect × genre × engine_version quality matrix
SELECT
  dialect,
  genre,
  engine_version,
  COUNT(*)                               AS generation_count,
  AVG(SAFE_CAST(rating AS FLOAT64))      AS avg_rating,
  AVG(latency_ms)                        AS avg_latency_ms,
  COUNTIF(regenerated = TRUE)            AS regeneration_count,
  SAFE_DIVIDE(
    COUNTIF(regenerated = TRUE),
    COUNT(*)
  ) * 100                                AS regeneration_rate_pct
FROM `<project_id>.ghanneli_analytics.events`
WHERE
  type = 'preview_generated'
  AND dialect IS NOT NULL
  AND genre IS NOT NULL
  AND engine_version IS NOT NULL
GROUP BY dialect, genre, engine_version
ORDER BY avg_rating DESC, generation_count DESC
```

**Charts to build:**
- Heatmap pivot: rows = dialect, columns = genre, cell value = avg_rating (colour scale)
- Bar chart: avg_latency_ms by engine_version
- Filter control: engine_version selector so ops can compare releases

---

## Dashboard 3 — Unit Economics

**Purpose:** Cost per song vs. revenue per song, margin by dialect and genre. Money in integer minor units (fils, AED).

**Looker Studio source:** `ghanneli_analytics.events`

### Backing SQL

```sql
-- Cost vs revenue per dialect / genre (integer minor units — fils)
SELECT
  dialect,
  genre,
  COUNT(DISTINCT song_id)                           AS songs_generated,
  SUM(gpu_cost_minor)                               AS total_gpu_cost_minor,
  SUM(amount_minor)                                 AS total_revenue_minor,
  SUM(amount_minor) - SUM(gpu_cost_minor)           AS gross_margin_minor,
  SAFE_DIVIDE(SUM(gpu_cost_minor), COUNT(DISTINCT song_id))
                                                    AS cost_per_song_minor,
  SAFE_DIVIDE(SUM(amount_minor),   COUNT(DISTINCT song_id))
                                                    AS revenue_per_song_minor,
  SAFE_DIVIDE(
    SUM(amount_minor) - SUM(gpu_cost_minor),
    NULLIF(SUM(amount_minor), 0)
  ) * 100                                           AS margin_pct
FROM `<project_id>.ghanneli_analytics.events`
WHERE
  type = 'purchase_completed'
  AND currency = 'aed'
GROUP BY dialect, genre
ORDER BY gross_margin_minor DESC
```

**Note on currency:** All `*_minor` columns are integer fils (AED × 100). Divide by 100 in Looker Studio calculated fields if you need display in AED.

**Charts to build:**
- Table: dialect, genre, songs_generated, cost_per_song_minor, revenue_per_song_minor, margin_pct
- Bar chart: gross_margin_minor by dialect
- Scorecard: total_revenue_minor, total_gpu_cost_minor, overall margin_pct

---

## Infrastructure reference

| Resource | Name |
|---|---|
| Pub/Sub topic | `analytics-events` |
| BQ dataset | `ghanneli_analytics` (EU) |
| Landing table | `ghanneli_analytics.events_raw` (partitioned by `publish_time`, DAY) |
| Analytical view | `ghanneli_analytics.events` |
| BQ subscription | `events-to-bq` |
| IAM binding | Pub/Sub service agent → `roles/bigquery.dataEditor` on dataset |
