<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  disabled?: boolean
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'abort'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Local value for v-model
const localValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

// Auto-resize textarea
function autoResize() {
  if (!textareaRef.value) return

  textareaRef.value.style.height = 'auto'
  const newHeight = Math.min(textareaRef.value.scrollHeight, 200)
  textareaRef.value.style.height = `${newHeight}px`
}

// Handle keydown
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!props.disabled && localValue.value.trim()) {
      emit('send')
    }
  }
}

// Watch value changes to resize
watch(localValue, () => {
  nextTick(() => autoResize())
})

// Focus on mount
onMounted(() => {
  textareaRef.value?.focus()
})
</script>

<template>
  <div class="p-3" style="background: var(--surface);">
    <div class="flex items-end gap-2">
      <!-- Input area -->
      <div class="flex-1 relative">
        <textarea
          ref="textareaRef"
          v-model="localValue"
          :disabled="disabled"
          rows="1"
          class="w-full px-4 py-2.5 rounded-lg text-[13px] resize-none focus:outline-none"
          :style="{
            background: 'var(--surface-raised)',
            color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            maxHeight: '200px',
          }"
          placeholder="Send a message..."
          @keydown="handleKeydown"
          @input="autoResize"
        />

        <!-- Character counter -->
        <div
          v-if="localValue.length > 0"
          class="absolute bottom-2 right-2 text-[10px] font-mono"
          :style="{
            color: localValue.length > 10000 ? '#cd3131' : 'var(--text-tertiary)',
          }"
        >
          {{ localValue.length.toLocaleString() }}
        </div>
      </div>

      <!-- Action button -->
      <button
        v-if="isStreaming"
        class="px-4 py-2.5 rounded-lg text-[12px] font-medium transition-all shrink-0"
        style="background: rgba(205, 49, 49, 0.1); color: #cd3131;"
        @click="emit('abort')"
      >
        <UIcon name="i-lucide-square" class="size-4" />
      </button>
      <button
        v-else
        class="px-4 py-2.5 rounded-lg text-[12px] font-medium transition-all shrink-0"
        :style="{
          background: disabled || !localValue.trim() ? 'var(--surface-raised)' : 'var(--accent)',
          color: disabled || !localValue.trim() ? 'var(--text-disabled)' : 'white',
          cursor: disabled || !localValue.trim() ? 'not-allowed' : 'pointer',
        }"
        :disabled="disabled || !localValue.trim()"
        @click="emit('send')"
      >
        <UIcon name="i-lucide-send" class="size-4" />
      </button>
    </div>

    <!-- Hints -->
    <div class="flex items-center justify-between mt-2 text-[10px]" style="color: var(--text-tertiary);">
      <div>
        <kbd class="px-1.5 py-0.5 rounded" style="background: var(--surface-raised);">Enter</kbd>
        to send,
        <kbd class="px-1.5 py-0.5 rounded" style="background: var(--surface-raised);">Shift + Enter</kbd>
        for new line
      </div>
      <div v-if="isStreaming">
        Generating response...
      </div>
    </div>
  </div>
</template>
