<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'
import { renderMarkdownWithMath } from '~/utils/markdown'
import { formatContent } from '~/utils/messageFormatting'

const props = defineProps<{
  message: DisplayChatMessage
}>()

const emit = defineEmits<{
  (e: 'permissionRespond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean): void
}>()

// Collapsible states
const showThinking = ref(false)
const showToolDetails = ref(false)

// Format and render content
const renderedContent = computed(() => {
  if (!props.message.content) return ''
  const formatted = formatContent(props.message.content)
  return renderMarkdownWithMath(formatted)
})

// Handle permission response
function handlePermissionAllow(remember = false) {
  if (props.message.permissionRequest) {
    emit('permissionRespond', props.message.permissionRequest.id, 'allow', remember)
  }
}

function handlePermissionDeny() {
  if (props.message.permissionRequest) {
    emit('permissionRespond', props.message.permissionRequest.id, 'deny', false)
  }
}
</script>

<template>
  <div
    class="flex items-start gap-3"
    :class="{
      'flex-row-reverse': message.role === 'user',
    }"
  >
    <div
      class="flex-1 flex flex-col"
      :class="{
        'items-end': message.role === 'user',
        'items-start': message.role !== 'user',
      }"
    >
      <!-- User Message -->
      <template v-if="message.role === 'user'">
        <div
          class="px-4 py-2 rounded-lg max-w-[85%]"
          style="background: var(--accent); color: white;"
        >
          <div class="text-[13px] whitespace-pre-wrap">{{ message.content }}</div>
        </div>
      </template>

      <!-- Assistant Text Message -->
      <template v-else-if="message.kind === 'text'">
        <div
          class="px-4 py-2 rounded-lg max-w-[85%]"
          style="background: var(--surface-raised);"
        >
          <div
            class="prose prose-sm max-w-none text-[13px]"
            style="color: var(--text-primary);"
            v-html="renderedContent"
          />
          <!-- Streaming cursor -->
          <span
            v-if="message.isStreaming"
            class="inline-block w-2 h-4 ml-1 animate-pulse"
            style="background: var(--accent);"
          />
        </div>
      </template>

      <!-- Thinking Block -->
      <template v-else-if="message.kind === 'thinking'">
        <div
          class="px-4 py-2 rounded-lg max-w-[85%] border"
          style="background: var(--surface); border-color: var(--border-subtle);"
        >
          <button
            class="flex items-center gap-2 text-[12px] font-medium w-full"
            style="color: var(--text-secondary);"
            @click="showThinking = !showThinking"
          >
            <UIcon
              :name="showThinking ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3"
            />
            <UIcon name="i-lucide-brain" class="size-3" />
            Thinking...
          </button>
          <div
            v-if="showThinking"
            class="mt-2 pt-2 border-t text-[12px] whitespace-pre-wrap"
            style="border-color: var(--border-subtle); color: var(--text-tertiary);"
          >
            {{ message.thinking || message.content }}
          </div>
        </div>
      </template>

      <!-- Tool Use -->
      <template v-else-if="message.kind === 'tool_use'">
        <div
          class="px-4 py-2 rounded-lg max-w-[85%] border"
          style="background: var(--surface); border-color: var(--border-subtle);"
        >
          <button
            class="flex items-center gap-2 text-[12px] font-medium w-full"
            style="color: var(--text-primary);"
            @click="showToolDetails = !showToolDetails"
          >
            <UIcon
              :name="showToolDetails ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3"
            />
            <UIcon name="i-lucide-wrench" class="size-3" style="color: var(--accent);" />
            {{ message.toolName }}
            <span
              v-if="message.isError"
              class="px-1.5 py-0.5 rounded text-[10px]"
              style="background: rgba(205, 49, 49, 0.1); color: #cd3131;"
            >
              Error
            </span>
          </button>

          <div v-if="showToolDetails" class="mt-2 pt-2 border-t space-y-2" style="border-color: var(--border-subtle);">
            <!-- Input -->
            <div v-if="message.toolInput">
              <div class="text-[10px] font-medium mb-1" style="color: var(--text-tertiary);">Input</div>
              <pre class="text-[11px] p-2 rounded overflow-auto max-h-32" style="background: var(--surface-base); color: var(--text-secondary);">{{ JSON.stringify(message.toolInput, null, 2) }}</pre>
            </div>

            <!-- Result -->
            <div v-if="message.toolResult">
              <div class="text-[10px] font-medium mb-1" style="color: var(--text-tertiary);">Result</div>
              <pre
                class="text-[11px] p-2 rounded overflow-auto max-h-32"
                :style="{
                  background: 'var(--surface-base)',
                  color: message.isError ? '#cd3131' : 'var(--text-secondary)',
                }"
              >{{ typeof message.toolResult === 'string' ? message.toolResult : JSON.stringify(message.toolResult, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </template>

      <!-- Permission Request -->
      <template v-else-if="message.kind === 'permission_request' && message.permissionRequest">
        <div
          class="px-4 py-3 rounded-lg max-w-[85%] border-2"
          style="background: rgba(229, 169, 62, 0.05); border-color: var(--accent);"
        >
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-lucide-shield-question" class="size-4" style="color: var(--accent);" />
            <span class="text-[12px] font-semibold" style="color: var(--text-primary);">
              Permission Required
            </span>
          </div>

          <p class="text-[12px] mb-3" style="color: var(--text-secondary);">
            {{ message.permissionRequest.toolName }} wants to perform an action:
          </p>

          <pre
            v-if="message.permissionRequest.toolInput"
            class="text-[11px] p-2 rounded mb-3 overflow-auto max-h-24"
            style="background: var(--surface-raised); color: var(--text-tertiary);"
          >{{ JSON.stringify(message.permissionRequest.toolInput, null, 2) }}</pre>

          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style="background: var(--accent); color: white;"
              @click="handlePermissionAllow(false)"
            >
              Allow
            </button>
            <button
              class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style="background: var(--surface-raised); color: var(--text-secondary);"
              @click="handlePermissionAllow(true)"
            >
              Allow & Remember
            </button>
            <button
              class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style="background: rgba(205, 49, 49, 0.1); color: #cd3131;"
              @click="handlePermissionDeny"
            >
              Deny
            </button>
          </div>
        </div>
      </template>

      <!-- Task Notification -->
      <template v-else-if="message.kind === 'task_notification' && message.taskProgress">
        <div
          class="px-4 py-2 rounded-lg max-w-[85%] border"
          style="background: var(--surface); border-color: var(--border-subtle);"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="message.taskProgress.status === 'running' ? 'i-lucide-loader-2' : message.taskProgress.status === 'completed' ? 'i-lucide-check-circle' : message.taskProgress.status === 'failed' ? 'i-lucide-x-circle' : 'i-lucide-circle'"
              class="size-4"
              :class="{ 'animate-spin': message.taskProgress.status === 'running' }"
              :style="{
                color: message.taskProgress.status === 'completed' ? '#0dbc79' : message.taskProgress.status === 'failed' ? '#cd3131' : 'var(--accent)',
              }"
            />
            <span class="text-[12px] font-medium" style="color: var(--text-primary);">
              {{ message.taskProgress.label }}
            </span>
          </div>

          <div
            v-if="message.taskProgress.progress !== undefined"
            class="mt-2 h-1.5 rounded-full overflow-hidden"
            style="background: var(--surface-raised);"
          >
            <div
              class="h-full rounded-full transition-all"
              :style="{
                width: `${message.taskProgress.progress}%`,
                background: 'var(--accent)',
              }"
            />
          </div>

          <p
            v-if="message.taskProgress.message"
            class="mt-1 text-[11px]"
            style="color: var(--text-tertiary);"
          >
            {{ message.taskProgress.message }}
          </p>
        </div>
      </template>

      <!-- Interactive Prompt -->
      <template v-else-if="message.kind === 'interactive_prompt' && message.interactivePrompt">
        <div
          class="px-4 py-3 rounded-lg max-w-[85%] border"
          style="background: var(--surface); border-color: var(--accent);"
        >
          <p class="text-[12px] font-medium mb-2" style="color: var(--text-primary);">
            {{ message.interactivePrompt.question }}
          </p>

          <div v-if="message.interactivePrompt.options" class="space-y-1">
            <button
              v-for="option in message.interactivePrompt.options"
              :key="option"
              class="w-full px-3 py-1.5 rounded-lg text-[12px] text-left hover-bg transition-all"
              style="background: var(--surface-raised); color: var(--text-secondary);"
            >
              {{ option }}
            </button>
          </div>

          <div v-else>
            <textarea
              class="w-full px-3 py-2 rounded-lg text-[12px] resize-none"
              :rows="message.interactivePrompt.multiline ? 3 : 1"
              :placeholder="message.interactivePrompt.placeholder || 'Type your answer...'"
              style="background: var(--surface-raised); color: var(--text-primary); border: 1px solid var(--border-subtle);"
            />
          </div>
        </div>
      </template>

      <!-- Error Message -->
      <template v-else-if="message.kind === 'error'">
        <div
          class="px-4 py-2 rounded-lg max-w-[85%]"
          style="background: rgba(205, 49, 49, 0.1); color: #cd3131;"
        >
          <div class="flex items-center gap-2 text-[12px] font-medium">
            <UIcon name="i-lucide-alert-circle" class="size-4" />
            Error
          </div>
          <p class="mt-1 text-[12px]">{{ message.content }}</p>
        </div>
      </template>

      <!-- Timestamp -->
      <div class="text-[10px] mt-1 px-1" style="color: var(--text-tertiary);">
        {{ new Date(message.timestamp).toLocaleTimeString() }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.prose :deep(pre) {
  background: var(--surface-base);
  border-radius: 0.5rem;
  padding: 0.75rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.prose :deep(code) {
  font-size: 0.85em;
  background: var(--surface-base);
  padding: 0.15em 0.3em;
  border-radius: 0.25rem;
}

.prose :deep(pre code) {
  background: none;
  padding: 0;
}

.prose :deep(p) {
  margin: 0.5rem 0;
}

.prose :deep(p:first-child) {
  margin-top: 0;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.prose :deep(ul), .prose :deep(ol) {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.prose :deep(li) {
  margin: 0.25rem 0;
}
</style>
