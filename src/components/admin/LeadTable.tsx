'use client'

import { useState } from 'react'
import { Lead } from '@/services/lead.service'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { MoreHorizontal, ExternalLink, Edit, Trash, Eye, EyeOff, Archive, Check } from 'lucide-react'
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

export function LeadTable({ initialLeads }: LeadTableProps) {
  const [leads, setLeads] = useState(initialLeads)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [idToDelete, setIdToDelete] = useState<string | null>(null)
  const [isBulkDelete, setIsBulkDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  
  const filteredLeads = leads.filter(l => 
    statusFilter === 'all' ? true : l.status === statusFilter
  )

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredLeads.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredLeads.map((l) => l.id))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleDeleteClick = (id: string) => {
    setIdToDelete(id)
    setIsBulkDelete(false)
    setDeleteDialogOpen(true)
    setOpenMenuId(null)
  }

  const handleBulkDeleteClick = () => {
    setIsBulkDelete(true)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    setLoading(true)
    try {
      const idsToDelete = isBulkDelete ? selectedIds : [idToDelete!]
      await deleteLeadsAction(idsToDelete)
      setLeads((prev) => prev.filter((l) => !idsToDelete.includes(l.id)))
      setSelectedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)))
      setDeleteDialogOpen(false)
    } catch (error) {
      alert('Failed to delete leads')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (ids: string[], status: 'draft' | 'published' | 'archived') => {
    setLoading(true)
    try {
      await updateLeadsStatusAction(ids, status)
      setLeads((prev) =>
        prev.map((l) => (ids.includes(l.id) ? { ...l, status } : l))
      )
      if (ids.length > 1) setSelectedIds([])
      setOpenMenuId(null)
    } catch (error) {
      alert('Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter and Bulk Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-sm border border-border">
          {['all', 'published', 'draft', 'archived'].map((f) => (
            <Button
              key={f}
              variant={statusFilter === f ? 'secondary' : 'ghost'}
              size="xs"
              className="text-[10px] font-bold uppercase tracking-widest px-3 h-7"
              onClick={() => {
                setStatusFilter(f)
                setSelectedIds([])
              }}
            >
              {f}
            </Button>
          ))}
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 animate-in fade-in zoom-in-95">
             <span className="text-[10px] font-bold text-muted-foreground mr-2">{selectedIds.length} SELECTED</span>
             <Button 
                variant="outline" 
                size="xs" 
                className="text-[10px] font-bold h-7"
                onClick={() => handleStatusChange(selectedIds, 'published')}
                disabled={loading}
              >
                PUBLISH
              </Button>
              <Button 
                variant="outline" 
                size="xs" 
                className="text-[10px] font-bold h-7"
                onClick={() => handleStatusChange(selectedIds, 'draft')}
                disabled={loading}
              >
                DRAFT
              </Button>
              <Button 
                variant="destructive" 
                size="xs" 
                className="text-[10px] font-bold h-7"
                onClick={handleBulkDeleteClick}
                disabled={loading}
              >
                DELETE
              </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-sm border border-border shadow-sm min-h-[400px]">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider font-bold">
            <tr>
              <th className="px-6 py-4 w-10">
                <Checkbox 
                  checked={selectedIds.length === filteredLeads.length && filteredLeads.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="px-6 py-4">Business Name</th>
              <th className="px-6 py-4">URL Slug</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Est. Savings</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground italic">
                  No {statusFilter !== 'all' ? statusFilter : ''} leads found.
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => (
                <tr key={lead.id} className={`hover:bg-muted/50 transition-colors ${selectedIds.includes(lead.id) ? 'bg-primary/5' : ''}`}>
                  <td className="px-6 py-4">
                    <Checkbox 
                      checked={selectedIds.includes(lead.id)}
                      onCheckedChange={() => toggleSelect(lead.id)}
                    />
                  </td>
                  <td className="px-6 py-4 font-semibold text-primary">{lead.business_name}</td>
                  <td className="px-6 py-4 text-muted-foreground">/proposal/{lead.slug}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold uppercase tracking-wider ${lead.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium">${lead.estimated_savings?.toLocaleString() ?? 0}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2">
                      <Link href={`/proposal/${lead.slug}`} target="_blank">
                        <Button variant="ghost" size="icon-sm" title="View Live">
                          <ExternalLink className="w-4 h-4 text-accent" />
                        </Button>
                      </Link>
                      
                      <div className="relative z-50">
                        <Button 
                          variant="ghost" 
                          size="icon-sm" 
                          onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>

                        {openMenuId === lead.id && (
                          <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-border rounded-sm shadow-[0_10px_30px_rgba(0,0,0,0.15)] z-[100] py-1 text-left animate-in fade-in zoom-in-95 slide-in-from-top-2">
                            <Link href={`/admin/leads/${lead.id}`} className="flex items-center px-4 py-2 text-sm hover:bg-muted text-primary transition-colors">
                              <Edit className="w-3.5 h-3.5 mr-2" /> Edit Details
                            </Link>
                            
                            {lead.status !== 'published' ? (
                              <button 
                                onClick={() => handleStatusChange([lead.id], 'published')}
                                className="w-full flex items-center px-4 py-2 text-sm hover:bg-muted text-primary"
                              >
                                <Eye className="w-3.5 h-3.5 mr-2" /> Go Live
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleStatusChange([lead.id], 'draft')}
                                className="w-full flex items-center px-4 py-2 text-sm hover:bg-muted text-primary"
                              >
                                <EyeOff className="w-3.5 h-3.5 mr-2" /> Move to Draft
                              </button>
                            )}
                            
                            <button 
                              onClick={() => handleStatusChange([lead.id], 'archived')}
                              className="w-full flex items-center px-4 py-2 text-sm hover:bg-muted text-primary"
                            >
                              <Archive className="w-3.5 h-3.5 mr-2" /> Archive
                            </button>
                            
                            <div className="h-px bg-border my-1" />
                            
                            <button 
                              onClick={() => handleDeleteClick(lead.id)}
                              className="w-full flex items-center px-4 py-2 text-sm hover:bg-muted text-destructive font-semibold"
                            >
                              <Trash className="w-3.5 h-3.5 mr-2" /> Delete Page
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

      {/* Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              {isBulkDelete 
                ? `Are you sure you want to delete ${selectedIds.length} lead pages? This action cannot be undone.`
                : "Are you sure you want to delete this lead page? This action cannot be undone."
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete} 
              disabled={loading}
            >
              {loading ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
