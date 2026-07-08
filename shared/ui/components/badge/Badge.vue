<script setup lang="ts">
import { computed } from 'vue';
import { cva, type VariantProps } from 'class-variance-authority';

defineOptions({ name: 'UiBadge' });

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type BadgeVariants = VariantProps<typeof badgeVariants>;

const props = withDefaults(defineProps<{
  variant?: BadgeVariants['variant'];
}>(), {
  variant: 'default',
});

const classes = computed(() => badgeVariants({ variant: props.variant }));
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
