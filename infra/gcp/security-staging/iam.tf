resource "google_cloud_run_v2_service_iam_member" "broker_callers" {
  for_each = { worker = google_service_account.worker.email, dispatcher = google_service_account.dispatcher.email }
  project  = var.project_id
  location = "us-east5"
  name     = google_cloud_run_v2_service.broker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${each.value}"
}
resource "google_cloud_run_v2_job_iam_member" "dispatcher" {
  project  = var.project_id
  location = "us-east5"
  name     = google_cloud_run_v2_job.worker.name
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${google_service_account.dispatcher.email}"
}
resource "google_secret_manager_secret_iam_member" "broker" {
  for_each  = google_secret_manager_secret.credentials
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.broker.email}"
}
# Build/deploy identities are intentionally not provisioned without separate authority review.
