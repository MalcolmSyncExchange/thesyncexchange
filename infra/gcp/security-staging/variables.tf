variable "project_id" {
  type    = string
  default = "tse-security-staging-media"
  validation {
    condition     = var.project_id == "tse-security-staging-media"
    error_message = "Security staging project only; bootstrap/availability must be separately verified."
  }
}
variable "worker_image" {
  type = string
  validation {
    condition     = can(regex("^us-east5-docker.pkg.dev/tse-security-staging-media/submission-media-staging/media-worker@sha256:[a-f0-9]{64}$", var.worker_image))
    error_message = "Pinned staging worker digest required."
  }
}
variable "broker_image" {
  type = string
  validation {
    condition     = can(regex("^us-east5-docker.pkg.dev/tse-security-staging-media/submission-media-staging/media-broker@sha256:[a-f0-9]{64}$", var.broker_image))
    error_message = "Pinned staging broker digest required."
  }
}
variable "db_secret_version" {
  type = string
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.db_secret_version))
    error_message = "Exact secret version required."
  }
}
variable "storage_secret_version" {
  type = string
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.storage_secret_version))
    error_message = "Exact secret version required."
  }
}
