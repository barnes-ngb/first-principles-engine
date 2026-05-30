import { useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'

import type { ChatContext, ChatThread, ShellyChatMessage } from '../../core/types'

// ── Image refinement types ─────────────────────────────────────

export interface RefinementQuestion {
  question: string
  options: string[]
}

export interface ChatAttachment {
  url: string
  previewUrl: string
}

export type ImageFlowStep = 'idea' | 'questions' | 'generating'

export interface ReflectionSuggestion {
  label: string
  message: string
}

/**
 * Stable, typed return for {@link useShellyChatState}. Grouped by concern so the
 * seams the Shelly portal build will plug into stay legible
 * (see docs/SHELLY_PORTAL_CONTEXT.md §6 — ARCH-09):
 *   - thread management        — chatContext / threads / activeThreadId
 *   - message list             — messages / input / followUps / reflectionSuggestions
 *   - send/response flow        — sending
 *   - image generation/upload   — generatingImage + the upload/reference clusters
 *   - image refinement          — imageFlow* / imageIdea / imageQuestions / imageAnswers
 *   - drawer / UI               — drawerOpen
 *   - refs                      — messagesEndRef / fileInputRef / autoSendTriggered / imageIdeaTimeoutFired
 */
export interface ShellyChatState {
  // ── Thread management ────────────────────────────────────────
  chatContext: ChatContext
  setChatContext: Dispatch<SetStateAction<ChatContext>>
  threads: ChatThread[]
  setThreads: Dispatch<SetStateAction<ChatThread[]>>
  activeThreadId: string | null
  setActiveThreadId: Dispatch<SetStateAction<string | null>>

  // ── Message list ─────────────────────────────────────────────
  messages: ShellyChatMessage[]
  setMessages: Dispatch<SetStateAction<ShellyChatMessage[]>>
  input: string
  setInput: Dispatch<SetStateAction<string>>
  followUps: string[]
  setFollowUps: Dispatch<SetStateAction<string[]>>
  reflectionSuggestions: ReflectionSuggestion[]
  setReflectionSuggestions: Dispatch<SetStateAction<ReflectionSuggestion[]>>

  // ── Send / response flow ─────────────────────────────────────
  sending: boolean
  setSending: Dispatch<SetStateAction<boolean>>

  // ── Drawer / UI ──────────────────────────────────────────────
  drawerOpen: boolean
  setDrawerOpen: Dispatch<SetStateAction<boolean>>

  // ── Image generation + upload ────────────────────────────────
  generatingImage: boolean
  setGeneratingImage: Dispatch<SetStateAction<boolean>>
  uploadPreview: string | null
  setUploadPreview: Dispatch<SetStateAction<string | null>>
  uploadFile: File | null
  setUploadFile: Dispatch<SetStateAction<File | null>>
  uploading: boolean
  setUploading: Dispatch<SetStateAction<boolean>>
  uploadDialogOpen: boolean
  setUploadDialogOpen: Dispatch<SetStateAction<boolean>>
  pendingAttachment: ChatAttachment | null
  setPendingAttachment: Dispatch<SetStateAction<ChatAttachment | null>>
  pendingReferenceImage: ChatAttachment | null
  setPendingReferenceImage: Dispatch<SetStateAction<ChatAttachment | null>>

  // ── Image refinement flow ────────────────────────────────────
  imageFlowOpen: boolean
  setImageFlowOpen: Dispatch<SetStateAction<boolean>>
  imageFlowStep: ImageFlowStep
  setImageFlowStep: Dispatch<SetStateAction<ImageFlowStep>>
  imageIdea: string
  setImageIdea: Dispatch<SetStateAction<string>>
  imageQuestions: RefinementQuestion[]
  setImageQuestions: Dispatch<SetStateAction<RefinementQuestion[]>>
  imageAnswers: Record<number, string>
  setImageAnswers: Dispatch<SetStateAction<Record<number, string>>>
  loadingQuestions: boolean
  setLoadingQuestions: Dispatch<SetStateAction<boolean>>

  // ── Refs ─────────────────────────────────────────────────────
  fileInputRef: RefObject<HTMLInputElement | null>
  messagesEndRef: RefObject<HTMLDivElement | null>
  autoSendTriggered: RefObject<boolean>
  imageIdeaTimeoutFired: RefObject<boolean>
}

/**
 * Owns every piece of state and ref for {@link ShellyChatPage}. This is a
 * behavior-preserving extraction: no business logic moves here, only the
 * `useState`/`useRef` declarations the component used to hold inline. The page
 * consumes this hook and keeps the same external prop/route contract.
 *
 * @param initialThreadId initial `activeThreadId` (the page derives it from the
 *   `thread` URL search param so routing behavior is unchanged).
 */
export function useShellyChatState(initialThreadId: string | null): ShellyChatState {
  // ── Thread management ────────────────────────────────────────
  const [chatContext, setChatContext] = useState<ChatContext>('general')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId)

  // ── Message list ─────────────────────────────────────────────
  const [messages, setMessages] = useState<ShellyChatMessage[]>([])
  const [input, setInput] = useState('')
  const [followUps, setFollowUps] = useState<string[]>([])
  const [reflectionSuggestions, setReflectionSuggestions] = useState<ReflectionSuggestion[]>([])

  // ── Send / response flow ─────────────────────────────────────
  const [sending, setSending] = useState(false)

  // ── Drawer / UI ──────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Image generation + upload ────────────────────────────────
  const [generatingImage, setGeneratingImage] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null)
  const [pendingReferenceImage, setPendingReferenceImage] = useState<ChatAttachment | null>(null)

  // ── Image refinement flow ────────────────────────────────────
  const [imageFlowOpen, setImageFlowOpen] = useState(false)
  const [imageFlowStep, setImageFlowStep] = useState<ImageFlowStep>('idea')
  const [imageIdea, setImageIdea] = useState('')
  const [imageQuestions, setImageQuestions] = useState<RefinementQuestion[]>([])
  const [imageAnswers, setImageAnswers] = useState<Record<number, string>>({})
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  // ── Refs ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const autoSendTriggered = useRef(false)
  const imageIdeaTimeoutFired = useRef(false)

  return {
    chatContext,
    setChatContext,
    threads,
    setThreads,
    activeThreadId,
    setActiveThreadId,
    messages,
    setMessages,
    input,
    setInput,
    followUps,
    setFollowUps,
    reflectionSuggestions,
    setReflectionSuggestions,
    sending,
    setSending,
    drawerOpen,
    setDrawerOpen,
    generatingImage,
    setGeneratingImage,
    uploadPreview,
    setUploadPreview,
    uploadFile,
    setUploadFile,
    uploading,
    setUploading,
    uploadDialogOpen,
    setUploadDialogOpen,
    pendingAttachment,
    setPendingAttachment,
    pendingReferenceImage,
    setPendingReferenceImage,
    imageFlowOpen,
    setImageFlowOpen,
    imageFlowStep,
    setImageFlowStep,
    imageIdea,
    setImageIdea,
    imageQuestions,
    setImageQuestions,
    imageAnswers,
    setImageAnswers,
    loadingQuestions,
    setLoadingQuestions,
    fileInputRef,
    messagesEndRef,
    autoSendTriggered,
    imageIdeaTimeoutFired,
  }
}
