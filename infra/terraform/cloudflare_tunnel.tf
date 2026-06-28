# Cloudflare Tunnel fronting the self-hosted L40S AIBackend (FastAPI on :8000).
# The App (cloud) reaches the lab over https://<lab>.<domain>/generate through
# this named tunnel; cloudflared runs on the L40S box (configured by Ansible,
# see infra/ansible). No inbound ports are opened on the lab box.

resource "cloudflare_zero_trust_tunnel_cloudflared" "lab" {
  account_id = var.cloudflare_account_id
  name       = "ghanneli-lab"
  secret     = var.tunnel_secret
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "lab" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.lab.id

  config {
    ingress_rule {
      hostname = "${var.lab_subdomain}.${var.domain}"
      service  = "http://localhost:8000"
    }
    # Catch-all required by cloudflared.
    ingress_rule {
      service = "http_status:404"
    }
  }
}

# DNS: lab.<domain> -> the tunnel (proxied through Cloudflare).
resource "cloudflare_record" "lab" {
  zone_id = var.cloudflare_zone_id
  name    = var.lab_subdomain
  content = "${cloudflare_zero_trust_tunnel_cloudflared.lab.id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
}

output "lab_tunnel_hostname" {
  value = "${var.lab_subdomain}.${var.domain}"
}
