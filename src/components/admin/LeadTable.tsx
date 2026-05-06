'use client'

import { useEffect, useMemo, useState, type SetStateAction } from 'react'
import type { Lead, LeadStatus } from '@/services/lead.service'
import { Button } from '@/components/ui/button'
import { Archive, CalendarCheck, Check, Crosshair, Edit, ExternalLink, Mail, MessageSquare, MoreHorizontal, PhoneCall, Radar, Send, Trash, TriangleAlert } from 'lucide-react'
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
import { readClientCache, writeClientCache } from '@/lib/client-cache'
import { createClient } from '@/lib/supabase'

interface LeadTableProps {
  initialLeads: Lead[]
}

const filters = ['all', 'published', 'contacted', 'emailed', 'replied', 'booked', 'archived'] as const
const LEADS_CACHE_KEY = 'admin:leads'

type StatusFilter = (typeof filters)[number]

function statusClass(status: Lead['status']) {
  if (status === 'published') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'contacted') return 'border-sky-200 bg-sky-50 text-sky-800'
  if (status === 'emailed') return 'border-blue-200 bg-blue-50 text-blue-800'
  if (status === 'replied') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'booked') return 'border-teal-200 bg-teal-50 text-teal-800'
  if (status === 'archived') return 'border-slate-200 bg-slate-100 text-slate-500'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function statusDot(status: Lead['status']) {
  if (status === 'published') return 'bg-emerald-500'
  if (status === 'contacted') return 'bg-sky-500'
  if (status === 'emailed') return 'bg-blue-500'
  if (status === 'replied') return 'bg-amber-500'
  if (status === 'booked') return 'bg-teal-500'
  if (status === 'archived') return 'bg-slate-500'
  return 'bg-slate-400'
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

function RowSelector({
  checked,
  label,
  onToggle,
}: {
  checked: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={`grid h-5 w-5 place-items-center border transition-colors ${
        checked
          ? 'rounded border-emerald-600 bg-emerald-600 text-white'
          : 'rounded border-slate-300 bg-white text-transparent hover:border-emerald-500'
      }`}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  )
}

export function LeadTable({ initialLeads }: LeadTableProps) {
  const [leads, setLeadsState] = useState(() => readClientCache<Lead[]>(LEADS_CACHE_KEY) || initialLeads)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)
  const [isBulkDelete, setIsBulkDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastDeleteCount, setLastDeleteCount] = useState<number | null>(null)

  const setLeads = (next: SetStateAction<Lead[]>) => {
    setLeadsState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      writeClientCache(LEADS_CACHE_KEY, resolved)
      return resolved
    })
  }

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    const refreshLeads = async () => {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })

      if (!mounted || !data) return
      const nextLeads = data as Lead[]
      setLeadsState(nextLeads)
      writeClientCache(LEADS_CACHE_KEY, nextLeads)
    }

    refreshLeads()
    const poller = window.setInterval(refreshLeads, 7000)
    const channel = supabase
      .channel('admin-leads-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          if (!mounted) return

          const deletedId = (payload.old as Pick<Lead, 'id'> | null)?.id
          if (payload.eventType === 'DELETE' && deletedId) {
            setLeads((prev) => prev.filter((lead) => lead.id !== deletedId))
            setSelectedIds((prev) => prev.filter((id) => id !== deletedId))
            return
          }

          const nextLead = payload.new as Lead | null
          if (!nextLead) return

          setLeads((prev) => {
            const existing = prev.filter((lead) => lead.id !== nextLead.id)
            return [nextLead, ...existing].sort((a, b) => (
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ))
          })
        },
      )
      .subscribe()

    return () => {
      mounted = false
      window.clearInterval(poller)
      supabase.removeChannel(channel)
    }
  }, [])

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
    <section className="admin-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <Radar className="h-4 w-4" />
            Proposals
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Proposal targets</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`admin-chip px-3 py-2 transition-colors ${statusFilter === filter ? 'admin-chip-active' : 'hover:border-slate-300 hover:text-slate-700'}`}
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
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm font-medium text-slate-600">
            {selectedIds.length > 0 ? `${selectedIds.length} selected` : lastDeleteCount !== null ? `${lastDeleteCount} deleted` : 'Action needed'}
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <TriangleAlert className="h-4 w-4" />
              {errorMessage}
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="xs" className="rounded-md border-slate-200 bg-white text-slate-700 hover:bg-slate-100" onClick={() => setSelectedIds([])} disabled={loading}>
                Clear
              </Button>
              <Button variant="outline" size="xs" className="rounded-md border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50" onClick={() => handleStatusChange(selectedIds, 'published')} disabled={loading}>
                Mark Published
              </Button>
              <Button variant="outline" size="xs" className="rounded-md border-sky-200 bg-white text-sky-800 hover:bg-sky-50" onClick={() => handleStatusChange(selectedIds, 'contacted')} disabled={loading}>
                Mark Contacted
              </Button>
              <Button variant="outline" size="xs" className="rounded-md border-blue-200 bg-white text-blue-800 hover:bg-blue-50" onClick={() => handleStatusChange(selectedIds, 'emailed')} disabled={loading}>
                Mark Emailed
              </Button>
              <Button variant="outline" size="xs" className="rounded-md border-amber-200 bg-white text-amber-800 hover:bg-amber-50" onClick={() => handleStatusChange(selectedIds, 'replied')} disabled={loading}>
                Mark Replied
              </Button>
              <Button variant="outline" size="xs" className="rounded-md border-teal-200 bg-white text-teal-800 hover:bg-teal-50" onClick={() => handleStatusChange(selectedIds, 'booked')} disabled={loading}>
                Mark Booked
              </Button>
              <Button variant="outline" size="xs" className="rounded-md border-slate-200 bg-white text-slate-700 hover:bg-slate-100" onClick={() => handleStatusChange(selectedIds, 'archived')} disabled={loading}>
                Archive
              </Button>
              <Button variant="destructive" size="xs" className="rounded-md border-red-200 bg-red-50 text-red-700 hover:bg-red-100" onClick={() => openDeleteDialog(selectedIds, true)} disabled={loading}>
                Delete
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <th className="w-12 px-4 py-3">
                <RowSelector
                  checked={allVisibleSelected}
                  onToggle={toggleSelectAll}
                  label={allVisibleSelected ? 'Deselect visible proposals' : 'Select visible proposals'}
                />
              </th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Proposal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Annual savings</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <div className="mx-auto max-w-sm rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
                    <Crosshair className="mx-auto h-7 w-7 text-slate-400" />
                    <div className="mt-3 text-sm font-semibold text-slate-700">No targets</div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead, index) => (
                <tr key={lead.id} className={`group transition-colors hover:bg-slate-50 ${selectedIds.includes(lead.id) ? 'bg-emerald-50/70' : ''}`}>
                  <td className="px-4 py-4 align-middle">
                    <RowSelector
                      checked={selectedIds.includes(lead.id)}
                      onToggle={() => toggleSelect(lead.id)}
                      label={`Select ${lead.business_name}`}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-950">{lead.business_name}</div>
                        <div className="mt-1 max-w-[22rem] truncate text-xs text-slate-500">{lead.address || 'No address'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs font-medium text-slate-700">/proposal/{lead.slug}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(lead.status)}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot(lead.status)}`} />
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="num text-base font-semibold text-slate-950">{formatUSD(lead.estimated_savings)}</div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/proposal/${lead.slug}`} target="_blank">
                        <Button variant="ghost" size="icon-sm" className="rounded-md text-slate-600 hover:bg-slate-100" title="View">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>

                      <div className="relative z-40">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-md text-slate-600 hover:bg-slate-100"
                          onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>

                        {openMenuId === lead.id && (
                          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                            <Link href={`/admin/leads/${lead.id}`} className="flex items-center px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50">
                              <Edit className="mr-2 h-3.5 w-3.5 text-slate-500" /> Edit
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleStatusChange([lead.id], 'published')}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50"
                            >
                              <Send className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Set Published
                            </button>

                            {statusActions.map((action) => {
                              const Icon = action.icon
                              return (
                                <button
                                  key={action.status}
                                  type="button"
                                  onClick={() => handleStatusChange([lead.id], action.status)}
                                  className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Icon className="mr-2 h-3.5 w-3.5 text-slate-500" /> {action.label}
                                </button>
                              )
                            })}

                            <button
                              type="button"
                              onClick={() => handleStatusChange([lead.id], 'archived')}
                              className="flex w-full items-center px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Archive className="mr-2 h-3.5 w-3.5 text-slate-500" /> Archive
                            </button>

                            <div className="my-1 h-px bg-slate-100" />

                            <button
                              type="button"
                              onClick={() => openDeleteDialog([lead.id])}
                              className="flex w-full items-center px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                            >
                              <Trash className="mr-2 h-3.5 w-3.5" /> Delete
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
        <DialogContent className="border border-red-200 bg-white text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:max-w-lg">
          <DialogHeader>
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              <TriangleAlert className="h-3.5 w-3.5" /> Delete
            </div>
            <DialogTitle className="text-xl text-slate-950">Delete proposal target?</DialogTitle>
            <DialogDescription className="text-slate-500">
              {isBulkDelete
                ? `This will permanently delete ${targetDeleteIds.length} proposal targets.`
                : `This will permanently delete ${targetDeleteNames[0] || 'this proposal target'}.`}
            </DialogDescription>
          </DialogHeader>

          {targetDeleteNames.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              {targetDeleteNames.map((name) => (
                <div key={name} className="flex items-center gap-2 py-1 text-sm text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {name}
                </div>
              ))}
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <TriangleAlert className="h-4 w-4" />
              {errorMessage}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" className="rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => handleDialogOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-lg border-red-200 bg-red-600 text-white hover:bg-red-700"
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
