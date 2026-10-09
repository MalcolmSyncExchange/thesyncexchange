# Existing isolated project only. Project/billing bootstrap is a separate authorization.
data "google_project" "staging" { project_id = var.project_id }
locals {
  labels   = { environment = "security-staging", component = "submission-media" }
  audience = "https://media-broker-staging-${data.google_project.staging.number}.us-east5.run.app"
  config = {
    MEDIA_ENV          = "security-staging"
    GCP_PROJECT        = var.project_id
    SUPABASE_REF       = "xgbiypruultmzbwhhjrx"
    SUPABASE_URL       = "https://xgbiypruultmzbwhhjrx.supabase.co"
    BROKER_AUDIENCE    = local.audience
    BROKER_URL         = local.audience
    WORKER_SUBJECT     = google_service_account.worker.unique_id
    WORKER_EMAIL       = google_service_account.worker.email
    DISPATCHER_SUBJECT = google_service_account.dispatcher.unique_id
    DISPATCHER_EMAIL   = google_service_account.dispatcher.email
  }
}
resource "google_project_service" "apis" {
  for_each           = toset(["run.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}
resource "google_artifact_registry_repository" "media" {
  location      = "us-east5"
  repository_id = "submission-media-staging"
  format        = "DOCKER"
  labels        = local.labels
  docker_config { immutable_tags = true }
  depends_on = [google_project_service.apis]
}
resource "google_service_account" "worker" { account_id = "media-worker-staging" }
resource "google_service_account" "broker" { account_id = "media-broker-staging" }
resource "google_service_account" "dispatcher" { account_id = "media-dispatcher-staging" }
resource "google_secret_manager_secret" "credentials" {
  for_each  = toset(["media-db-staging", "media-storage-staging"])
  secret_id = each.value
  labels    = local.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}
# No secret-version resource: values must never enter this state.
resource "google_cloud_run_v2_service" "broker" {
  name                = "media-broker-staging"
  location            = "us-east5"
  labels              = local.labels
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL" # HTTPS reachable but IAM authenticated; no allUsers binding.
  template {
    service_account                  = google_service_account.broker.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    max_instance_request_concurrency = 4
    timeout                          = "130s"
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.broker_image
      resources { limits = { cpu = "1", memory = "512Mi" } }
      ports { container_port = 8080 }
      dynamic "env" {
        for_each = merge(local.config, {
          DB_SECRET      = "projects/${var.project_id}/secrets/media-db-staging/versions/${var.db_secret_version}"
          STORAGE_SECRET = "projects/${var.project_id}/secrets/media-storage-staging/versions/${var.storage_secret_version}"
        })
        content {
          name  = env.key
          value = env.value
        }
      }
      volume_mounts {
        name       = "work"
        mount_path = "/work"
      }
    }
    volumes {
      name = "work"
      empty_dir {
        medium     = "MEMORY"
        size_limit = "32Mi"
      }
    }
  }
  depends_on = [google_project_service.apis]
}
resource "google_cloud_run_v2_job" "worker" {
  name                = "media-worker-staging"
  location            = "us-east5"
  labels              = local.labels
  deletion_protection = true
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.worker.email
      max_retries     = 0
      timeout         = "600s"
      containers {
        name  = "worker"
        image = var.worker_image
        resources { limits = { cpu = "2", memory = "2Gi" } }
        dynamic "env" {
          for_each = merge(local.config, { MEDIA_REMOTE_ENABLED = "security-staging", MEDIA_RUNTIME = "cloud-run-gen2", MEDIA_BUILD_DIGEST = split("@", var.worker_image)[1], MEDIA_TOOL_DIR = "/opt/media/bin", TMPDIR = "/work" })
          content {
            name  = env.key
            value = env.value
          }
        }
        volume_mounts {
          name       = "work"
          mount_path = "/work"
        }
      }
      volumes {
        name = "work"
        empty_dir {
          medium     = "MEMORY"
          size_limit = "512Mi"
        }
      }
    }
  }
  depends_on = [google_project_service.apis]
}
