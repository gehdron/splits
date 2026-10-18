"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Profile = {
  display_name: string;
  phone: string;
  bio: string;
  avatar_url: string | null;
};

export function ProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoPreviewUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl.current) URL.revokeObjectURL(photoPreviewUrl.current);
    };
  }, []);

  function selectPhoto(file: File | null) {
    if (photoPreviewUrl.current) URL.revokeObjectURL(photoPreviewUrl.current);
    photoPreviewUrl.current = file ? URL.createObjectURL(file) : null;
    setPhotoPreview(photoPreviewUrl.current);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        body: new FormData(event.currentTarget),
      });
      const result = await response.json() as { error?: string; profile?: Profile };
      if (!response.ok || !result.profile) {
        setError(result.error ?? "Profile could not be saved. Try again.");
        return;
      }
      setProfile(result.profile);
      if (photoPreviewUrl.current) URL.revokeObjectURL(photoPreviewUrl.current);
      photoPreviewUrl.current = null;
      setPhotoPreview(null);
      if (photoInput.current) photoInput.current.value = "";
      setMessage("Your profile has been saved.");
    } catch {
      setError("Profile could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const shownPhoto = photoPreview ?? profile.avatar_url;

  return (
    <form className="profile-form" onSubmit={saveProfile}>
      <div className="profile-photo">
        {shownPhoto ? (
          <Image src={shownPhoto} alt="Profile photo preview" width={88} height={88} unoptimized />
        ) : (
          <span aria-hidden="true">{profile.display_name.slice(0, 1).toUpperCase()}</span>
        )}
        <label>
          Profile photo
          <input
            accept="image/jpeg,image/png,image/webp"
            name="photo"
            ref={photoInput}
            onChange={(event) => {
              selectPhoto(event.currentTarget.files?.[0] ?? null);
              setError("");
              setMessage("");
            }}
            type="file"
          />
          <small>JPEG, PNG, or WebP. 2 MB maximum.</small>
        </label>
      </div>
      <label>
        Name
        <input
          autoComplete="name"
          maxLength={80}
          minLength={2}
          name="display_name"
          required
          onChange={(event) => setProfile((current) => ({ ...current, display_name: event.currentTarget.value }))}
          value={profile.display_name}
        />
      </label>
      <label>
        Phone
        <input
          autoComplete="tel"
          name="phone"
          required
          onChange={(event) => setProfile((current) => ({ ...current, phone: event.currentTarget.value }))}
          value={profile.phone}
          type="tel"
        />
      </label>
      <label>
        Description
        <textarea
          maxLength={280}
          name="bio"
          onChange={(event) => setProfile((current) => ({ ...current, bio: event.currentTarget.value }))}
          rows={4}
          value={profile.bio}
        />
        <small>Up to 280 characters.</small>
      </label>
      {error ? <p className="err" role="alert">{error}</p> : null}
      {message ? <p className="ok" role="status">{message}</p> : null}
      <button className="btn btn-b" disabled={saving} type="submit">
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
