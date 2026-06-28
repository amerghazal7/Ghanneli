variable "project_id" { type = string }

variable "region" {
  type    = string
  default = "europe-west1"
}

# --- Cloudflare (L40S lab tunnel, Task 2.6) ---
variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "domain" {
  type        = string
  description = "Apex domain managed in the Cloudflare zone, e.g. ghanneli.com"
}

variable "lab_subdomain" {
  type        = string
  default     = "lab"
  description = "Subdomain that fronts the L40S AIBackend via the tunnel"
}

variable "tunnel_secret" {
  type        = string
  sensitive   = true
  description = "Base64-encoded 32+ byte secret for the named Cloudflare Tunnel"
}
