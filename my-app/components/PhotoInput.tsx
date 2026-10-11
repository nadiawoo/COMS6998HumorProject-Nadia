"use client";

import { useState } from "react";
import { CameraIcon } from "./Icons";

// Visible photo button + instant preview. The photo is shrunk in the browser
// (max 512px JPEG) before upload, so it stays far below the 4 MB limit.
export function PhotoInput({ current, initials }: { current?: string | null; initials: string }) {
  const [preview, setPreview] = useState<string | null>(current ?? null);

  async function shrink(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return;
    const small = new DataTransfer();
    small.items.add(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    input.files = small.files; // replace the original with the small version
    setPreview(URL.createObjectURL(blob));
  }

  return (
    <div className="flex items-center gap-5">
      {preview
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={preview} alt="Your profile photo" className="h-28 w-28 rounded-full border-2 border-black object-cover" />
        : <div className="flex h-28 w-28 items-center justify-center rounded-full bg-black text-3xl font-bold text-white">{initials}</div>}
      <label className="flex cursor-pointer items-center gap-2 border-2 border-black px-4 py-2.5 font-bold hover:bg-black hover:text-white">
        <CameraIcon /> {preview ? "Change photo" : "Upload photo"}
        <input name="photo" type="file" accept="image/*" onChange={shrink} className="sr-only" />
      </label>
    </div>
  );
}
