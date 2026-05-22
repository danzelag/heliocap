import { createAdminClient } from '@/lib/supabase-server'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'
import { getProposalWorkflowJob, getProspect } from '@/lib/proposal-workflow-fetch'
import { publishLead } from '@/lib/proposal-workflow-publish'
import { generateProposalPreview, generateRoofAssets } from '@/lib/proposal-workflow-render'
import {
  asRecord,
  describeUnknownError,
  getString,
  getUniqueLeadSlug,
  setWorkflowProgress,
  type WorkflowJob,
} from '@/lib/proposal-workflow-shared'

export async function runInAppProposalWorkflow(jobId: string) {
  const supabase = await createAdminClient()
  let job: WorkflowJob | null = null
  let activeStep = 'Loading proposal job'

  try {
    job = await getProposalWorkflowJob(supabase, jobId)
    const receipt = asRecord(job.receipt)
    const prospectId = getString(receipt.prospect_id)

    activeStep = 'Starting app workflow'
    await setWorkflowProgress(supabase, job, {
      step: 'App workflow started',
      progressPercent: 8,
      buildStatus: 'processing',
      receipt: { engine: 'app', video_optional: false, video_required: false },
    })

    activeStep = 'Loading prospect'
    const prospect = prospectId ? await getProspect(supabase, prospectId) : null

    activeStep = 'Generating roof and solar assets'
    const roofAssets = await generateRoofAssets(supabase, job, prospect)

    activeStep = 'Generating proposal preview'
    const preview = await generateProposalPreview(supabase, job, roofAssets)

    activeStep = 'Publishing still proposal'
    const published = await publishLead({
      supabase,
      job,
      prospect,
      roofAssets,
      renderPreviewUrl: preview.renderPreviewUrl,
      renderSource: preview.source,
    })

    activeStep = 'Proposal published'
    await updateProposalJobProgress(supabase, {
      jobId: job.id,
      businessName: job.business_name,
      status: 'completed',
      step: 'Proposal published',
      progressPercent: 100,
      proposalUrl: published.proposalUrl,
      leadId: published.leadId,
      receipt: {
        ...asRecord(job.receipt),
        build_status: 'proposal_published',
        build_status_label: 'Proposal Ready',
        video_complete: false,
        video_optional: false,
        video_required: false,
        updated_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    const errorDetails = describeUnknownError(error)
    const message = errorDetails.message || 'Unknown proposal workflow error'
    const failureMessage = `${activeStep}: ${message}`
    console.error('[proposal-workflow] failed', {
      jobId,
      activeStep,
      ...errorDetails,
    })

    if (job) {
      await setWorkflowProgress(supabase, job, {
        status: 'failed',
        step: 'Workflow failed',
        progressPercent: 100,
        errorMessage: failureMessage,
        buildStatus: 'failed',
        receipt: {
          failed_at: new Date().toISOString(),
          failure_step: activeStep,
          failure: errorDetails,
        },
      })
    } else {
      await updateProposalJobProgress(supabase, {
        jobId,
        status: 'failed',
        step: 'Workflow failed',
        progressPercent: 100,
        errorMessage: failureMessage,
        receipt: {
          build_status: 'failed',
          build_status_label: 'Failed',
          error: failureMessage,
          failure_step: activeStep,
          failure: errorDetails,
          engine: 'app',
          updated_at: new Date().toISOString(),
        },
      })
    }
  }
}

export { getUniqueLeadSlug }
