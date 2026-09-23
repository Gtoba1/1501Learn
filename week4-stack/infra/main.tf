# Section 4 lab: the storage layer as code.
#   tofu init && tofu apply     (or terraform init && terraform apply)
#
# The point of this file is that `tofu destroy` followed by `tofu apply`
# rebuilds the lake from nothing. When this platform later moves to AWS or
# Azure, the provider block changes and the resource intent does not.

terraform {
  required_version = ">= 1.6"
  required_providers {
    minio = {
      source  = "aminueza/minio"
      version = "~> 3.0"
    }
  }
}

provider "minio" {
  minio_server   = var.minio_server
  minio_user     = var.minio_user
  minio_password = var.minio_password
  minio_ssl      = false
}

resource "minio_s3_bucket" "layer" {
  for_each = toset(["bronze", "silver", "gold"])
  bucket   = each.key
}

# Bronze holds raw landings that are cheap to re-fetch. Expiring them keeps
# the lake from growing without limit -- the same lifecycle rule you would
# write against S3 or ADLS.
resource "minio_ilm_policy" "expire_bronze" {
  bucket = minio_s3_bucket.layer["bronze"].bucket

  rule {
    id         = "expire-raw-landings"
    expiration = "90d"
  }
}

output "buckets" {
  value       = [for b in minio_s3_bucket.layer : b.bucket]
  description = "The medallion layers, created from code."
}
