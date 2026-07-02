"use client";

import { Icon } from "@/components/Icon";
import { useApp } from "@/lib/store";

export function Fab() {
  const { openPost } = useApp();
  return (
    <button
      onClick={() => openPost(true)}
      aria-label="Poster un deal"
      className="fixed bottom-24 right-margin-mobile z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-float transition-transform active:scale-90"
    >
      <Icon name="add" className="text-[28px]" />
    </button>
  );
}
