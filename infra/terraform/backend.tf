# Partial GCS backend — bucket and prefix are supplied at init time:
#   terraform init -backend-config="bucket=<your-state-bucket>" -backend-config="prefix=ghanneli/terraform"
# The state bucket must be provisioned out-of-band (e.g. via gsutil or the GCP Console)
# before running `terraform init`, to avoid the chicken-and-egg problem.
terraform {
  backend "gcs" {}
}
