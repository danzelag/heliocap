'use client'

import { useMemo, useState } from 'react'
import type { Lead, LeadStatus } from '@/services/lead.service'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Archive, CalendarCheck, Crosshair, Edit, ExternalLink, Mail, MessageSquare, MoreHorizontal, PhoneCall, Radar, Send, Trash, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { deleteLeadsAction, updateLeadsStatusAction } from '@/app/admin/actions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface LeadTableProps {
  initialLeads: Lead[]
}

const filters = ['all', 'published', 'contacted', 'emailed', 'replied', 'booked', 'archived'] as const

type StatusFilter = (typeof filters)[number]

function statusClass(status: Lead['status']) {
  if (status === 'published') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
  if (status === 'contacted') return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
  if (status === 'emailed') return 'border-blue-300/30 bg-blue-300/10 text-blue-100'
  if (status === 'replied') return 'border-amber-300/30 bg-amber-300/10 text-amber-100'
  if (status === 'booked') return 'border-roi/35 bg-roi/10 text-roi'
  if (status === 'archived') return 'border-slate-500/30 bg-slate-500/10 text-slate-400'
  return 'border-white/20 bg-white/5 text-slate-200'
}

function statusDot(status: Lead['status']) {
  if (status === 'published') return 'bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.65)]'
  if (status === 'contacted') return 'bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.5)]'
  if (status === 'emailed') return 'bg-blue-300 shadow-[0_0_18px_rgba(147,197,253,0.45)]'
  if (status === 'replied') return 'bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.45)]'
  if (status === 'booked') return 'bg-roi shadow-[0_0_18px_rgba(16,185,129,0.6)]'
  if (status === 'archived') return 'bg-slate-500'
  return 'bg-slate-300'
}

const statusActions: Array<{ status: LeadStatus; label: string; icon: typeof PhoneCall }> = [
  { status: 'contacted', label: 'Mark Contacted', icon: PhoneCall },
  { status: 'emailed', label: 'Mark Emailed', icon: Mail },
  { status: 'replied', label: 'Mark Replied', icon: MessageSquare },
  { status: 'booked', label: 'Mark Booked', icon: CalendarCheck },
]

function formatUSD(value: number | null) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

export function LeadTable({ initialLeads }: LeadTableProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)
  const [isBulkDelete, setIsBulkDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastDeleteCount, setLastDeleteCount] = useState<number | null>(null)

  const counts = useMemo(() => ({
    all: leads.length,
    published: leads.filter((lead) => lead.status === 'published').length,
    contacted: leads.filter((lead) => lead.status === 'contacted').length,
    emailed: leads.filter((lead) => lead.status === 'emailed').length,
    replied: leads.filter((lead) => lead.status === 'replied').length,
    booked: leads.filter((lead) => lead.status === 'booked').length,
    archived: leads.filter((lead) => lead.status === 'archived').length,
  }), [leads])

  const filteredLeads = leads.filter((lead) =>
    statusFilter === 'all' ? true : lead.status === statusFilter
  )
  const filteredLeadIds = filteredLeads.map((lead) => lead.id)
  const selectedVisibleCount = selectedIds.filter((id) => filteredLeadIds.includes(id)).length
  const allVisibleSelected = filteredLeads.length > 0 && selectedVisibleCount === filteredLeads.length

  const targetDeleteIds = isBulkDelete ? selectedIds : idToDelete ? [idToDelete] : []
  const targetDeleteNames = leads
    .filter((lead) => targetDeleteIds.includes(lead.id))
    .map((lead) => lead.business_name)

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredLeadIds.includes(id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredLeadIds])))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    )
  }

  const openDeleteDialog = (ids: string[], bulk = false) => {
    setErrorMessage(null)
    setLastDeleteCount(null)
    setIdToDelete(bulk ? null : ids[0] || null)
    setIsBulkDelete(bulk)
    setDeleteDialogOpen(true)
    setOpenMenuId(null)
  }

  const handleDialogOpenChange = (open: boolean) => {
    setDeleteDialogOpen(open)
    if (!open && !loading) {
      setIdToDelete(null)
      setIsBulkDelete(false)
      setErrorMessage(null)
    }
  }

  const confirmDelete = async () => {
    const idsToDelete = isBulkDelete ? selectedIds : idToDelete ? [idToDelete] : []

    if (idsToDelete.length === 0) {
      setErrorMessage('No proposal targets were selected for deletion.')
      return
    }

    setLoading(true)
    setErrorMessage(null)

    try {
      const result = await deleteLeadsAction(idsToDelete)
      
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to delete proposal targets.')
        return
      }

      setLeads((prev) => prev.filter((lead) => !idsToDelete.includes(lead.id)))
      setSelectedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)))
      setLastDeleteCount(result.deleted || 0)
      setDeleteDialogOpen(false)
      setIdToDelete(null)
      setIsBulkDelete(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete proposal targets.'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (ids: string[], status: LeadStatus) => {
    if (ids.length === 0) return

    setLoading(true)
    setErrorMessage(null)

    try {
      await updateLeadsStatusAction(ids, status)
      setLeads((prev) =>
        prev.map((lead) => (ids.includes(lead.id) ? { ...lead, status } : lead))
      )
      if (ids.length > 1) setSelectedIds([])
      setOpenMenuId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update proposal status.'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="border border-white/10 bg-black/35 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="flex flex-col gap-5 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-200/70">
            <Radar className="h-4 w-4" />
            Proposal Target Registry
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Active Microsite Grid</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors ${statusFilter === filter ? 'border-cyan-200/40 bg-cyan-200/10 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-500 hover:border-cyan-200/20 hover:text-slate-200'}`}
              onClick={() => {
                setStatusFilter(filter)
                setSelectedIds([])
              }}
            >
              {filter} <span className="text-slate-500">{counts[filter]}</span>
            </button>
          ))}
        </div>
      </div>

      {(selectedIds.length > 0 || lastDeleteCount !== null || errorMessage) && (
        <div className="flex flex-col gap-3 border-b border-white/10 bg-slate-950/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
            {selectedIds.length > 0 ? `${selectedIds.length} targets selected` : lastDeleteCount !== null ? `${lastDeleteCount} targets deleted` : 'Action channel'}
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 border border-red-300/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              <TriangleAlert className="h-4 w-4" />
              {errorMessage}
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="xs" className="rounded-none border-white/15 bg-white/[0.03] font-mono text-[10px] uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10" onClick={() => setSelectedIds([])} disabled={loading}>
                Clear Selection
              </Button>
              <Button variant="outline" size="xs" className="rounded-none border-emerald-300/25 bg-emerald-300/5 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-100 hover:bg-emerald-300/10" onClick={() => handleStatusChange(selectedIds, 'published')} disabled={loading}>
                Mark Published
              </Button>
              <Button variant="outline" size="xs" className="rounded-none border-cyan-300/25 bg-cyan-300/5 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100 hover:bg-cyan-300/10" onClick={() => handleStatusChange(selectedIds, 'contacted')} disabled={loading}>
                Mark Contacted
              </Button>
              <Button variant="outline" size="xs" className="rounded-none border-blue-300/25 bg-blue-300/5 font-mono text-[10px] uppercase tracking-[0.2em] text-blue-100 hover:bg-blue-300/10" onClick={() => handleStatusChange(selectedIds, 'emailed')} disabled={loading}>
                Mark Emailed
              </Button>
              <Button variant="outline" size="xs" className="rounded-none border-amber-300/25 bg-amber-300/5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100 hover:bg-amber-300/10" onClick={() => handleStatusChange(selectedIds, 'replied')} disabled={loading}>
                Mark Replied
              </Button>
              <Button variant="outline" size="xs" className="rounded-none border-roi/25 bg-roi/5 font-mono text-[10px] uppercase tracking-[0.2em] text-roi hover:bg-roi/10" onClick={() => handleStatusChange(selectedIds, 'booked')} disabled={loading}>
                Mark Booked
              </Button>
              <Button variant="outline" size="xs" className="rounded-none border-slate-400/25 bg-slate-400/5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-200 hover:bg-white/10" onClick={() => handleStatusChange(selectedIds, 'archived')} disabled={loading}>
                Archive Selected
              </Button>
              <Button variant="destructive" size="xs" className="rounded-none border-red-300/25 bg-red-500/10 font-mono text-[10px] uppercase tracking-[0.2em] text-red-100 hover:bg-red-500/20" onClick={() => openDeleteDialog(selectedIds, true)} disabled={loading}>
                Delete Selected
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.025] font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
              <th className="w-12 px-5 py-4">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAll}
                  className="border-cyan-200/40 bg-white/[0.03] text-slate-950 data-[state=checked]:border-cyan-100 data-[state=checked]:bg-cyan-100"
                  aria-label={allVisibleSelected ? 'Deselect visible proposals' : 'Select visible proposals'}
                  title={allVisibleSelected ? 'Deselect visible proposals' : 'Select visible proposals'}
                />
              </th>
              <th className="px-5 py-4">Target</th>
              <th className="px-5 py-4">Microsite Vector</th>
              <th className="px-5 py-4">State</th>
              <th className="px-5 py-4 text-right">Savings Signal</th>
              <th className="px-5 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <div className="mx-auto max-w-sm border border-dashed border-white/15 bg-white/[0.025] p-8">
                    <Crosshair className="mx-auto h-8 w-8 text-slate-600" />
                    <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">No targets in this view</div>
                    <p className="mt-2 text-sm text-slate-400">Switch filters or add a new proposal target.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead, index) => (
                <tr key={lead.id} className={`group transition-colors hover:bg-cyan-200/[0.035] ${selectedIds.includes(lead.id) ? 'bg-cyan-200/[0.06]' : ''}`}>
                  <td className="px-5 py-5 align-middle">
                    <Checkbox
                      checked={selectedIds.includes(lead.id)}
                      onCheckedChange={() => toggleSelect(lead.id)}
                      className="border-cyan-200/35 bg-white/[0.03] text-slate-950 data-[state=checked]:border-cyan-100 data-[state=checked]:bg-cyan-100"
                      aria-label={`Select ${lead.business_name}`}
                      title={`Select ${lead.business_name}`}
                    />
                  </td>
                  <td className="px-5 py-5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center border border-cyan-200/15 bg-cyan-200/[0.04] font-mono text-[10px] text-cyan-100">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{lead.business_name}</div>
                        <div className="mt-1 max-w-[22rem] truncate font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{lead.address || 'No site address on file'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-5">
                    <div className="font-mono text-xs text-cyan-100">/proposal/{lead.slug}</div>
                    <div className="mt-1 text-xs text-slate-500">Vercel public route</div>
                  </td>
                  <td className="px-5 py-5">
                    <span className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${statusClass(lead.status)}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(lead.status)}`} />
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-5 text-right">
                    <div className="num text-lg font-semibold text-white">{formatUSD(lead.estimated_savings)}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">annual modeled</div>
                  </td>
                  <td className="px-5 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/proposal/${lead.slug}`} target="_blank">
                        <Button variant="ghost" size="icon-sm" className="rounded-none text-cyan-100 hover:bg-cyan-200/10" title="View Live">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>

                      <div className="relative z-40">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-none text-slate-300 hover:bg-white/10"
                          onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>

                        {openMenuId === lead.id && (
                          <div className="absolute right-0 top-full z-50 mt-2 w-56 border border-cyan-200/15 bg-[#071018] py-1 text-left shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                            <Link href={`/admin/leads/${lead.id}`} className="flex items-center px-4 py-2.5 text-sm text-slate-200 transition-colors hover:bg-cyan-200/10">
                              <Edit className="mr-2 h-3.5 w-3.5 text-cyan-200" /> Edit target file
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleStatusChange([lead.id], 'published')}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 hover:bg-emerald-300/10"
                            >
                              <Send className="mr-2 h-3.5 w-3.5 text-emerald-200" /> Set Published
                            </button>

                            {statusActions.map((action) => {
                              const Icon = action.icon
                              return (
                                <button
                                  key={action.status}
                                  type="button"
                                  onClick={() => handleStatusChange([lead.id], action.status)}
                                  className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 hover:bg-cyan-200/10"
                                >
                                  <Icon className="mr-2 h-3.5 w-3.5 text-cyan-100" /> {action.label}
                                </button>
                              )
                            })}

                            <button
                              type="button"
                              onClick={() => handleStatusChange([lead.id], 'archived')}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10"
                            >
                              <Archive className="mr-2 h-3.5 w-3.5 text-slate-400" /> Archive
                            </button>

                            <div className="my-1 h-px bg-white/10" />

                            <button
                              type="button"
                              onClick={() => openDeleteDialog([lead.id])}
                              className="flex w-full items-center px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/10"
                            >
                              <Trash className="mr-2 h-3.5 w-3.5" /> Delete proposal
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="border border-red-300/20 bg-[#080b10] text-slate-100 shadow-[0_24px_90px_rgba(0,0,0,0.65)] sm:max-w-lg">
          <DialogHeader>
            <div className="mb-2 inline-flex w-fit items-center gap-2 border border-red-300/20 bg-red-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-red-100">
              <TriangleAlert className="h-3.5 w-3.5" /> Destructive operation
            </div>
            <DialogTitle className="text-xl tracking-[-0.03em] text-white">Delete proposal target?</DialogTitle>
            <DialogDescription className="text-slate-400">
              {isBulkDelete
                ? `This will permanently delete ${targetDeleteIds.length} proposal targets.`
                : `This will permanently delete ${targetDeleteNames[0] || 'this proposal target'}.`}
            </DialogDescription>
          </DialogHeader>

          {targetDeleteNames.length > 0 && (
            <div className="max-h-32 overflow-y-auto border border-white/10 bg-white/[0.03] p-3">
              {targetDeleteNames.map((name) => (
                <div key={name} className="flex items-center gap-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
                  {name}
                </div>
              ))}
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-2 border border-red-300/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              <TriangleAlert className="h-4 w-4" />
              {errorMessage}
            </div>
          )}

          <DialogFooter className="mt-4 border-white/10 bg-white/[0.03]">
            <Button variant="outline" className="rounded-none border-white/15 bg-transparent text-slate-200 hover:bg-white/10" onClick={() => handleDialogOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-none border-red-300/25 bg-red-500/15 font-mono text-[10px] uppercase tracking-[0.2em] text-red-100 hover:bg-red-500/25"
              onClick={confirmDelete}
              disabled={loading || targetDeleteIds.length === 0}
            >
              {loading ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
