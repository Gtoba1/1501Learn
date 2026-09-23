variable "minio_server" {
  description = "MinIO S3 endpoint, host:port with no scheme."
  type        = string
  default     = "localhost:9000"
}

variable "minio_user" {
  description = "MinIO access key. Read from TF_VAR_minio_user, never committed."
  type        = string
  sensitive   = true
}

variable "minio_password" {
  description = "MinIO secret key. Read from TF_VAR_minio_password, never committed."
  type        = string
  sensitive   = true
}
