terraform {
  required_version = "= 1.13.4"
  required_providers {
    google = { source = "hashicorp/google", version = "= 7.0.1" }
  }
}
provider "google" {
  project = var.project_id
  region  = "us-east5"
}
