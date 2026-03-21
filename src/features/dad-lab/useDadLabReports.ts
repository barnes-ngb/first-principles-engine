import { useCallback, useEffect, useState } from 'react'
import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import { useFamilyId } from '../../core/auth/useAuth'
import { dadLabReportsCollection, hoursCollection } from '../../core/firebase/firestore'
import { useChildren } from '../../core/hooks/useChildren'
import type { DadLabReport } from '../../core/types'
import type { DadLabStatus } from '../../core/types/enums'

export function useDadLabReports() {
  const familyId = useFamilyId()
  const { children } = useChildren()
  const [reports, setReports] = useState<DadLabReport[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const q = query(dadLabReportsCollection(familyId), orderBy('date', 'desc'))
    const snap = await getDocs(q)
    setReports(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    setLoading(false)
  }, [familyId])

  // Use real-time listener so Nathan sees Lincoln's contributions immediately
  useEffect(() => {
    const q = query(dadLabReportsCollection(familyId), orderBy('date', 'desc'))
    const unsubscribe = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
      setLoading(false)
    })
    return unsubscribe
  }, [familyId])

  const syncComplianceHours = useCallback(
    async (reportId: string, report: DadLabReport) => {
      // Delete existing hours for this lab report
      const existingQ = query(
        hoursCollection(familyId),
        where('source', '==', 'dad-lab'),
        where('labReportId', '==', reportId),
      )
      const existing = await getDocs(existingQ)
      for (const d of existing.docs) {
        await deleteDoc(doc(hoursCollection(familyId), d.id))
      }

      // Create new hours entries if we have minutes and subjects
      if (!report.totalMinutes || report.totalMinutes <= 0 || report.subjectTags.length === 0) return

      const minutesPerSubject = Math.round(report.totalMinutes / report.subjectTags.length)

      for (const child of children) {
        for (const subject of report.subjectTags) {
          await addDoc(hoursCollection(familyId), {
            childId: child.id,
            date: report.date,
            subjectBucket: subject,
            minutes: minutesPerSubject,
            location: 'Home',
            source: 'dad-lab',
            labReportId: reportId,
            notes: `Dad Lab: ${report.title}`,
          } as never)
        }
      }
    },
    [familyId, children],
  )

  const saveReport = useCallback(
    async (report: DadLabReport): Promise<string> => {
      const now = new Date().toISOString()
      const isNew = !report.id
      let reportId: string

      if (isNew) {
        const data = { ...report, createdAt: now, updatedAt: now }
        delete (data as { id?: string }).id
        const ref = await addDoc(dadLabReportsCollection(familyId), data)
        reportId = ref.id
      } else {
        reportId = report.id!
        const ref = doc(dadLabReportsCollection(familyId), reportId)
        await setDoc(ref, { ...report, updatedAt: now })
      }

      // Only sync compliance hours for completed labs
      if (report.status === 'complete') {
        await syncComplianceHours(reportId, report)
      }

      // Reload list
      await load()
      return reportId
    },
    [familyId, syncComplianceHours, load],
  )

  const updateStatus = useCallback(
    async (reportId: string, status: DadLabStatus) => {
      const ref = doc(dadLabReportsCollection(familyId), reportId)
      await updateDoc(ref, { status, updatedAt: new Date().toISOString() })

      // If completing, sync compliance hours
      if (status === 'complete') {
        const report = reports.find((r) => r.id === reportId)
        if (report) {
          await syncComplianceHours(reportId, { ...report, status })
        }
      }

      await load()
    },
    [familyId, reports, syncComplianceHours, load],
  )

  const deleteReport = useCallback(
    async (reportId: string) => {
      // Delete compliance hours first
      const existingQ = query(
        hoursCollection(familyId),
        where('source', '==', 'dad-lab'),
        where('labReportId', '==', reportId),
      )
      const existing = await getDocs(existingQ)
      for (const d of existing.docs) {
        await deleteDoc(doc(hoursCollection(familyId), d.id))
      }

      await deleteDoc(doc(dadLabReportsCollection(familyId), reportId))
      await load()
    },
    [familyId, load],
  )

  return { reports, loading, saveReport, updateStatus, deleteReport } as const
}
