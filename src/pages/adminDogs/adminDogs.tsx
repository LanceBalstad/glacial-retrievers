import { useEffect, useMemo, useRef, useState } from "react";
import logo from "../../assets/logo.jpg";
import {
  auth,
  isAllowedAdminEmail,
  subscribeToAuth,
} from "../../lib/firebase";
import { adminFetch } from "../../lib/adminApi";
import BreedSelect, { type BreedOption } from "./breedSelect.tsx";
import { preparePhoto, type PreparedPhoto } from "./preparePhoto";
import "./adminDogs.css";

interface DogFormState {
  breed_id: number;
  status_id: number;
  name: string;
  date_of_birth: string;
  sex: "M" | "F" | "";
  price: string;
  description: string;
}

const emptyFormState: DogFormState = {
  breed_id: 0,
  status_id: 0,
  name: "",
  date_of_birth: "",
  sex: "",
  price: "",
  description: "",
};

// Row returned by GET /api/admin/dogs (every dog, any status).
interface AdminDog {
  id: number;
  breed_id: number;
  status_id: number;
  name: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  sex: "M" | "F" | null;
  // Uploaded photo (/api/dogs/:id/image?v=…), or null if none.
  photo_url: string | null;
  price: string | number | null;
  description: string | null;
  breed: string | null;
  status: string | null;
}

const calculateAge = (dateOfBirth: string | null): string | null => {
  if (!dateOfBirth) {
    return null;
  }

  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();

  if (Number.isNaN(birthDate.getTime()) || birthDate > today) {
    return null;
  }

  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();

  if (today.getDate() < birthDate.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years === 0) {
    return months <= 1 ? (months === 1 ? "1 month old" : "Under 1 month old") : `${months} months old`;
  }

  return years === 1 ? "1 year old" : `${years} years old`;
};

// Open inquiry or upcoming pickup, from GET /api/admin/dogs/:id/appointments.
interface DogAppointment {
  event_id: number;
  first_name: string | null;
  last_name: string | null;
  event_status: "requested" | "confirmed";
  start_date: string | null; // YYYY-MM-DD
}

interface DeleteTarget {
  dog: AdminDog;
  appointments: DogAppointment[] | null; // null while checking
  error: string | null;
  isDeleting: boolean;
}

const formatPickupDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));

const describeAppointment = (appointment: DogAppointment) => {
  const name =
    [appointment.first_name, appointment.last_name].filter(Boolean).join(" ") || "A customer";

  return appointment.event_status === "confirmed" && appointment.start_date
    ? `${name} has an appointment to pick up this dog on ${formatPickupDate(appointment.start_date)}.`
    : `${name} has asked about buying this dog (no pickup scheduled yet).`;
};

const formatPrice = (price: string | number | null) => {
  const value = price === null ? null : Number(price);
  return value !== null && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value)
    : null;
};

const AdminDogs = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [dogs, setDogs] = useState<AdminDog[]>([]);
  const [isLoadingDogs, setIsLoadingDogs] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  // Each filter uses "" for "All".
  const [breedFilter, setBreedFilter] = useState("");
  const [sexFilter, setSexFilter] = useState<"" | "M" | "F">("");
  const [ageFilter, setAgeFilter] = useState<"" | "puppy">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  // Open inquiries/pickups returned when the edit changes the dog's status.
  const [statusWarning, setStatusWarning] = useState<DogAppointment[] | null>(null);
  // Status the dog had when the edit form opened.
  const [originalStatusId, setOriginalStatusId] = useState<number | null>(null);
  const [isAddingBreed, setIsAddingBreed] = useState(false);
  const [newBreedName, setNewBreedName] = useState("");
  // Photo in the add/edit form: the dog's current uploaded photo, a newly
  // picked one waiting for Save, or a pending removal.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PreparedPhoto | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dogForm, setDogForm] = useState<DogFormState>(emptyFormState);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDogId, setEditingDogId] = useState<number | null>(null);
  const [statusOptions, setStatusOptions] = useState<{ id: number; status: string }[]>([]);
  const [breedOptions, setBreedOptions] = useState<BreedOption[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setIsAdmin(false);
      return;
    }

    const unsubscribe = subscribeToAuth((nextUser) => {
      setIsAdmin(Boolean(nextUser && isAllowedAdminEmail(nextUser.email)));
    });

    return unsubscribe;
  }, []);

  // Both option lists are admin routes, so wait for the admin sign-in.
  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const loadDropdowns = async () => {
      try {
        const [statusResponse, breedResponse] = await Promise.all([
          adminFetch("/api/admin/dog-statuses"),
          adminFetch("/api/admin/dog-breeds"),
        ]);

        if (statusResponse.ok) {
          const statuses: { id: number; status: string }[] = await statusResponse.json();
          setStatusOptions(statuses);
          setDogForm((current) =>
            current.status_id === 0 && statuses.length > 0
              ? { ...current, status_id: statuses[0].id }
              : current,
          );
        }

        if (breedResponse.ok) {
          const breeds: BreedOption[] = await breedResponse.json();
          setBreedOptions(breeds);
          setDogForm((current) =>
            current.breed_id === 0 && breeds.length > 0
              ? { ...current, breed_id: breeds[0].id }
              : current,
          );
        }
      } catch (loadError) {
        console.error("Failed to load dog form options:", loadError);
      }
    };

    void loadDropdowns();
  }, [isAdmin]);

  // The admin token is only available once Firebase confirms the admin user.
  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let isCurrent = true;

    const loadDogs = async () => {
      setIsLoadingDogs(true);
      setListError(null);

      try {
        const response = await adminFetch("/api/admin/dogs");

        if (!response.ok) {
          const result: { error?: string } = await response.json().catch(() => ({}));
          throw new Error(result.error || "Could not load dogs.");
        }

        const rows: AdminDog[] = await response.json();
        if (isCurrent) {
          setDogs(rows);
        }
      } catch (loadError) {
        if (isCurrent) {
          setListError(loadError instanceof Error ? loadError.message : "Could not load dogs.");
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDogs(false);
        }
      }
    };

    void loadDogs();
    return () => {
      isCurrent = false;
    };
  }, [isAdmin, refreshKey]);

  // Built from the dogs themselves: /api/dog-breeds only lists breeds that
  // currently have an available dog.
  const breedFilterOptions = useMemo(() => {
    const breeds = new Map<number, string>();
    for (const dog of dogs) {
      if (dog.breed) {
        breeds.set(dog.breed_id, dog.breed);
      }
    }
    return [...breeds].sort((a, b) => a[1].localeCompare(b[1]));
  }, [dogs]);

  const visibleDogs = useMemo(() => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const today = new Date();

    // Same rule as the public "Puppy (under 1 year)" filter.
    const isPuppy = (dateOfBirth: string | null) => {
      if (!dateOfBirth) {
        return false;
      }
      const birthDate = new Date(`${dateOfBirth}T00:00:00`);
      return birthDate > oneYearAgo && birthDate <= today;
    };

    return dogs.filter(
      (dog) =>
        (!breedFilter || String(dog.breed_id) === breedFilter) &&
        (!sexFilter || dog.sex === sexFilter) &&
        (!ageFilter || isPuppy(dog.date_of_birth)) &&
        (!statusFilter || dog.status === statusFilter),
    );
  }, [dogs, breedFilter, sexFilter, ageFilter, statusFilter]);

  const hasFilters = Boolean(breedFilter || sexFilter || ageFilter || statusFilter);

  const resetFilters = () => {
    setBreedFilter("");
    setSexFilter("");
    setAgeFilter("");
    setStatusFilter("");
  };

  // Throws the server's message (e.g. "2 dogs are this breed…") for the picker to show.
  const handleDeleteBreed = async (option: BreedOption) => {
    const response = await adminFetch(`/api/admin/dog-breeds/${option.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const result: { error?: string } = await response.json().catch(() => ({}));
      throw new Error(result.error || "Could not delete the breed.");
    }

    setBreedOptions((current) => current.filter((breed) => breed.id !== option.id));
    setDogForm((current) =>
      current.breed_id === option.id ? { ...current, breed_id: 0 } : current,
    );
  };

  const resetNewBreed = () => {
    setIsAddingBreed(false);
    setNewBreedName("");
  };

  const resetPhoto = (currentPhotoUrl: string | null) => {
    setExistingPhotoUrl(currentPhotoUrl);
    setPendingPhoto(null);
    setRemovePhoto(false);
    setPhotoError(null);
  };

  // The admin picked a photo from the camera roll: shrink it and preview it.
  // It's uploaded when the dog is saved.
  const handlePhotoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsPreparingPhoto(true);
    try {
      setPendingPhoto(await preparePhoto(file));
      setRemovePhoto(false);
    } catch (prepareError) {
      setPhotoError(prepareError instanceof Error ? prepareError.message : "That photo couldn’t be used.");
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  // Uploads or removes the photo after the dog itself is saved.
  const syncPhoto = async (dogId: number) => {
    if (pendingPhoto) {
      const response = await adminFetch(`/api/admin/dogs/${dogId}/image`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingPhoto),
      });
      if (!response.ok) {
        const result: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(`The dog was saved, but the photo didn’t upload: ${result.error ?? "please try again."}`);
      }
    } else if (removePhoto && existingPhotoUrl) {
      const response = await adminFetch(`/api/admin/dogs/${dogId}/image`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("The dog was saved, but the photo couldn’t be removed. Please try again.");
      }
    }
  };

  const openCreateForm = () => {
    resetNewBreed();
    resetPhoto(null);
    setStatusWarning(null);
    setOriginalStatusId(null);
    setEditingDogId(null);
    setDogForm((current) => ({
      ...emptyFormState,
      breed_id: breedOptions[0]?.id ?? current.breed_id ?? 0,
      status_id: statusOptions[0]?.id ?? current.status_id ?? 0,
    }));
    setError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (dog: AdminDog) => {
    resetNewBreed();
    resetPhoto(dog.photo_url);
    setStatusWarning(null);
    setOriginalStatusId(dog.status_id ?? null);
    setEditingDogId(dog.id);
    setDogForm({
      breed_id: dog.breed_id ?? breedOptions[0]?.id ?? 0,
      status_id: dog.status_id ?? statusOptions[0]?.id ?? 0,
      name: dog.name ?? "",
      date_of_birth: dog.date_of_birth ?? "",
      sex: dog.sex ?? "",
      price: dog.price == null ? "" : String(dog.price),
      description: dog.description ?? "",
    });
    setError(null);
    setIsFormOpen(true);
  };

  const handleFieldChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;

    // A different status choice needs its own check on the next save.
    if (name === "status_id") {
      setStatusWarning(null);
    }

    setDogForm((current) => ({
      ...current,
      [name]: name === "breed_id" || name === "status_id" ? Number(value) : value,
    }));
  };

  const statusName = (statusId: number | null) => {
    const status = statusOptions.find((option) => option.id === statusId)?.status ?? "unknown";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // The newly picked photo, else the dog's current photo (unless removed).
  const hasUploadedPhoto = pendingPhoto !== null || (existingPhotoUrl !== null && !removePhoto);
  const photoPreviewUrl =
    pendingPhoto?.card ?? (existingPhotoUrl && !removePhoto ? `${existingPhotoUrl}&size=card` : null);

  // force = the admin chose "Save anyway" after the status warning.
  const handleSaveDog = async (force = false) => {
    if (!isAdmin) {
      setError("Admin access is required to save dog records.");
      return;
    }

    const typedBreed = newBreedName.trim().replace(/\s+/g, " ");

    if (isAddingBreed && !typedBreed) {
      setError("Please type the new breed name.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      let breedId = dogForm.breed_id;

      if (isAddingBreed) {
        const breedResponse = await adminFetch("/api/admin/dog-breeds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ breed: typedBreed }),
        });

        const breedResult: { id?: number; breed?: string; error?: string } = await breedResponse
          .json()
          .catch(() => ({}));

        if (!breedResponse.ok || breedResult.id === undefined || !breedResult.breed) {
          throw new Error(breedResult.error || "Unable to add the new breed.");
        }

        // Returns the existing breed if that name was already there.
        const savedBreed = { id: breedResult.id, breed: breedResult.breed };
        breedId = savedBreed.id;
        setBreedOptions((current) =>
          current.some((option) => option.id === savedBreed.id)
            ? current
            : [...current, savedBreed].sort((a, b) => a.breed.localeCompare(b.breed)),
        );
        setDogForm((current) => ({ ...current, breed_id: savedBreed.id }));
        resetNewBreed();
      }

      if (!breedId) {
        throw new Error("Please choose a breed.");
      }

      const payload = {
        breed_id: breedId,
        status_id: dogForm.status_id,
        name: dogForm.name.trim(),
        date_of_birth: dogForm.date_of_birth || null,
        sex: dogForm.sex || null,
        price: dogForm.price === "" ? null : Number(dogForm.price),
        description: dogForm.description.trim() || null,
      };

      const response = await adminFetch(
        editingDogId
          ? `/api/admin/dogs/${editingDogId}${force ? "?force=true" : ""}`
          : "/api/admin/dogs",
        {
          method: editingDogId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const result: { error?: string; appointments?: DogAppointment[] } = await response
          .json()
          .catch(() => ({}));

        // Status change on a dog someone is buying: show who first.
        if (response.status === 409 && result.appointments) {
          setStatusWarning(result.appointments);
          return;
        }

        throw new Error(result.error || "Unable to save this dog.");
      }

      // A new dog gets its id from the response. Keep it, so retrying after a
      // failed photo upload updates this dog instead of creating another.
      let savedDogId = editingDogId;
      if (savedDogId === null) {
        const created: { id?: number } = await response.json().catch(() => ({}));
        savedDogId = created.id ?? null;
        if (savedDogId !== null) {
          setEditingDogId(savedDogId);
          setRefreshKey((value) => value + 1);
        }
      }
      if (savedDogId !== null) {
        await syncPhoto(savedDogId);
      }

      setStatusWarning(null);
      setIsFormOpen(false);
      setEditingDogId(null);
      setDogForm(emptyFormState);
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save this dog right now.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Opens the delete dialog and checks whether anyone is waiting on this dog.
  const handleDeleteDog = async (dog: AdminDog) => {
    if (!isAdmin) {
      return;
    }

    setDeleteTarget({ dog, appointments: null, error: null, isDeleting: false });

    try {
      const response = await adminFetch(`/api/admin/dogs/${dog.id}/appointments`);

      if (!response.ok) {
        const result: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not check this dog's appointments.");
      }

      const appointments: DogAppointment[] = await response.json();
      setDeleteTarget((current) =>
        current?.dog.id === dog.id ? { ...current, appointments } : current,
      );
    } catch (checkError) {
      setDeleteTarget((current) =>
        current?.dog.id === dog.id
          ? {
              ...current,
              appointments: [],
              error:
                checkError instanceof Error
                  ? checkError.message
                  : "Could not check this dog's appointments.",
            }
          : current,
      );
    }
  };

  const confirmDeleteDog = async () => {
    if (!deleteTarget || deleteTarget.appointments === null) {
      return;
    }

    const { dog, appointments } = deleteTarget;
    setDeleteTarget({ ...deleteTarget, error: null, isDeleting: true });

    try {
      // force only once the admin has seen the appointment warning.
      const query = appointments.length > 0 ? "?force=true" : "";
      const response = await adminFetch(`/api/admin/dogs/${dog.id}${query}`, {
        method: "DELETE",
      });

      const result: { error?: string; appointments?: DogAppointment[] } = await response
        .json()
        .catch(() => ({}));

      // Someone asked about the dog after the dialog opened: show the warning.
      if (response.status === 409 && result.appointments) {
        setDeleteTarget({
          dog,
          appointments: result.appointments,
          error: null,
          isDeleting: false,
        });
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || "Unable to delete this dog.");
      }

      setDeleteTarget(null);
      setRefreshKey((value) => value + 1);
    } catch (deleteError) {
      setDeleteTarget((current) =>
        current
          ? {
              ...current,
              isDeleting: false,
              error:
                deleteError instanceof Error
                  ? deleteError.message
                  : "Unable to delete this dog right now.",
            }
          : current,
      );
    }
  };

  return (
    <main className="all-dogs-page">
      <div className="all-dogs-content" id="available-dogs">
        {isAdmin && (
          <div className="admin-dogs-toolbar">
            <button type="button" className="admin-add-dog" onClick={openCreateForm}>
              Add dog
            </button>
          </div>
        )}

        {isAdmin && isFormOpen && (
          <div className="admin-dog-modal-backdrop" onClick={() => setIsFormOpen(false)}>
            <section
              className="admin-dog-form-panel"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dog-form-title"
            >
              <div className="admin-dog-modal-header">
                <h2 id="dog-form-title">{editingDogId ? "Edit dog" : "Add dog"}</h2>
                <button
                  type="button"
                  className="admin-modal-close"
                  aria-label="Close dog form"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingDogId(null);
                    setError(null);
                  }}
                >
                  ×
                </button>
              </div>

              <div className="admin-form-grid">
                <label>
                  <span>Name</span>
                  <input
                    name="name"
                    value={dogForm.name}
                    onChange={handleFieldChange}
                    placeholder="Dog name"
                  />
                </label>

                {/* div, not label: it holds two controls (the toggle and the picker). */}
                <div className="admin-form-field">
                  <div className="admin-form-field-head">
                    <span id="dog-breed-label">
                      {isAddingBreed ? "New breed name" : "Breed"}
                    </span>
                    <button
                      type="button"
                      className="admin-breed-toggle"
                      onClick={() => (isAddingBreed ? resetNewBreed() : setIsAddingBreed(true))}
                    >
                      {isAddingBreed ? "Cancel" : "+ New breed"}
                    </button>
                  </div>

                  {isAddingBreed ? (
                    <input
                      aria-labelledby="dog-breed-label"
                      value={newBreedName}
                      onChange={(event) => setNewBreedName(event.target.value)}
                      placeholder="e.g. Boykin Spaniel"
                      maxLength={100}
                      autoFocus
                    />
                  ) : (
                    <BreedSelect
                      options={breedOptions}
                      value={dogForm.breed_id}
                      onChange={(breedId) =>
                        setDogForm((current) => ({ ...current, breed_id: breedId }))
                      }
                      onDelete={handleDeleteBreed}
                      labelledBy="dog-breed-label"
                    />
                  )}
                </div>

                <label>
                  <span>Status</span>
                  <select
                    name="status_id"
                    value={dogForm.status_id || ""}
                    onChange={handleFieldChange}
                  >
                    {statusOptions.length === 0 && <option value="">Select status</option>}
                    {statusOptions.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.status}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Date of birth</span>
                  <input
                    type="date"
                    name="date_of_birth"
                    value={dogForm.date_of_birth}
                    onChange={handleFieldChange}
                  />
                </label>

                <label>
                  <span>Sex</span>
                  <select name="sex" value={dogForm.sex} onChange={handleFieldChange}>
                    <option value="">Select</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </label>

                <label>
                  <span>Price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="price"
                    value={dogForm.price}
                    onChange={handleFieldChange}
                    placeholder="0.00"
                  />
                </label>

                <div className="admin-form-full admin-photo-field">
                  <span className="admin-photo-label">Photo</span>
                  <div className="admin-photo-row">
                    <div className="admin-photo-preview">
                      {photoPreviewUrl ? (
                        <img src={photoPreviewUrl} alt="Dog photo preview" />
                      ) : (
                        <span>No photo yet</span>
                      )}
                    </div>
                    <div className="admin-photo-actions">
                      <button
                        type="button"
                        className="admin-photo-button"
                        disabled={isPreparingPhoto}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {isPreparingPhoto ? "Preparing photo…" : hasUploadedPhoto ? "Change photo" : "Upload photo"}
                      </button>
                      {hasUploadedPhoto && (
                        <button
                          type="button"
                          className="admin-photo-remove"
                          disabled={isPreparingPhoto}
                          onClick={() => {
                            setPendingPhoto(null);
                            setRemovePhoto(true);
                          }}
                        >
                          Remove photo
                        </button>
                      )}
                      <p className="admin-photo-hint">
                        {pendingPhoto
                          ? "New photo ready. It’s uploaded when you save."
                          : removePhoto
                            ? "Photo will be removed when you save."
                            : "Choose a photo from your camera roll, or take a new one."}
                      </p>
                    </div>
                  </div>
                  {photoError && <p className="admin-dog-form-error">{photoError}</p>}
                  {/* accept="image/*" without capture: phones offer Photo Library and Camera. */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => void handlePhotoFile(event)}
                  />
                </div>

                <label className="admin-form-full">
                  <span>Description</span>
                  <textarea
                    name="description"
                    value={dogForm.description}
                    onChange={handleFieldChange}
                    rows={5}
                    placeholder="Dog description"
                  />
                </label>
              </div>

              {statusWarning && statusWarning.length > 0 && (
                <div className="admin-dog-delete-warning admin-dog-status-warning" role="alert">
                  <p className="admin-dog-delete-warning-title">
                    Someone is waiting on this dog
                  </p>
                  <ul>
                    {statusWarning.map((appointment) => (
                      <li key={appointment.event_id}>{describeAppointment(appointment)}</li>
                    ))}
                  </ul>
                  <p>
                    You’re changing {dogForm.name.trim() || "this dog"}’s status from{" "}
                    <strong>{statusName(originalStatusId)}</strong> to{" "}
                    <strong>{statusName(dogForm.status_id)}</strong>. This won’t cancel the
                    booking, and the status will update on its own again if that booking
                    changes.
                  </p>
                </div>
              )}

              {error && <p className="admin-dog-form-error">{error}</p>}

              <div className="admin-form-actions">
                <button
                  type="button"
                  className="admin-form-cancel"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingDogId(null);
                    setError(null);
                    setStatusWarning(null);
                  }}
                >
                  Cancel
                </button>
                {statusWarning && originalStatusId !== null && (
                  <button
                    type="button"
                    className="admin-form-cancel"
                    onClick={() => {
                      setDogForm((current) => ({ ...current, status_id: originalStatusId }));
                      setStatusWarning(null);
                    }}
                    disabled={isSaving}
                  >
                    Keep {statusName(originalStatusId)}
                  </button>
                )}
                <button
                  type="button"
                  className={`admin-form-save${statusWarning ? " admin-form-danger" : ""}`}
                  onClick={() => handleSaveDog(Boolean(statusWarning))}
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Saving..."
                    : statusWarning
                      ? "Save anyway"
                      : editingDogId
                        ? "Save changes"
                        : "Add dog"}
                </button>
              </div>
            </section>
          </div>
        )}

        {isAdmin && deleteTarget && (
          <div className="admin-dog-modal-backdrop">
            <section
              className="admin-dog-form-panel admin-dog-delete-panel"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="dog-delete-title"
              aria-describedby="dog-delete-body"
            >
              <div className="admin-dog-modal-header">
                <h2 id="dog-delete-title">
                  Delete {deleteTarget.dog.name || "this dog"}?
                </h2>
                <button
                  type="button"
                  className="admin-modal-close"
                  aria-label="Cancel delete"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteTarget.isDeleting}
                >
                  ×
                </button>
              </div>

              <div id="dog-delete-body">
                {deleteTarget.appointments === null ? (
                  <p className="admin-dog-delete-text" role="status">
                    Checking for pickups…
                  </p>
                ) : deleteTarget.appointments.length > 0 ? (
                  <div className="admin-dog-delete-warning" role="alert">
                    <p className="admin-dog-delete-warning-title">
                      Someone is waiting on this dog
                    </p>
                    <ul>
                      {deleteTarget.appointments.map((appointment) => (
                        <li key={appointment.event_id}>{describeAppointment(appointment)}</li>
                      ))}
                    </ul>
                    <p>
                      If you delete the dog anyway, the booking stays on the calendar as{" "}
                      <strong>{deleteTarget.dog.name || "Unnamed dog"} (deleted)</strong>.
                    </p>
                  </div>
                ) : (
                  <p className="admin-dog-delete-text">
                    This permanently removes the dog record. This can’t be undone.
                  </p>
                )}
              </div>

              {deleteTarget.error && (
                <p className="admin-dog-form-error">{deleteTarget.error}</p>
              )}

              <div className="admin-form-actions">
                <button
                  type="button"
                  className="admin-form-cancel"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteTarget.isDeleting}
                >
                  Keep dog
                </button>
                <button
                  type="button"
                  className="admin-form-save admin-form-danger"
                  onClick={confirmDeleteDog}
                  disabled={deleteTarget.appointments === null || deleteTarget.isDeleting}
                >
                  {deleteTarget.isDeleting
                    ? "Deleting..."
                    : deleteTarget.appointments && deleteTarget.appointments.length > 0
                      ? "Delete anyway"
                      : "Delete dog"}
                </button>
              </div>
            </section>
          </div>
        )}

        {isAdmin && (
          <section className="admin-dogs-section" aria-labelledby="admin-dogs-title">
            <div className="admin-dogs-heading">
              <h2 id="admin-dogs-title">All dogs</h2>
              <div className="admin-dog-filters" role="group" aria-label="Filter dogs">
                <label>
                  <span>Breed</span>
                  <select
                    value={breedFilter}
                    onChange={(event) => setBreedFilter(event.target.value)}
                  >
                    <option value="">All breeds</option>
                    {breedFilterOptions.map(([id, breed]) => (
                      <option key={id} value={id}>
                        {breed}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Gender</span>
                  <select
                    value={sexFilter}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "" || value === "M" || value === "F") {
                        setSexFilter(value);
                      }
                    }}
                  >
                    <option value="">All</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </label>
                <label>
                  <span>Age</span>
                  <select
                    value={ageFilter}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "" || value === "puppy") {
                        setAgeFilter(value);
                      }
                    }}
                  >
                    <option value="">All ages</option>
                    <option value="puppy">Puppy (under 1 year)</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="">All</option>
                    {statusOptions.map((option) => (
                      <option key={option.id} value={option.status}>
                        {option.status.charAt(0).toUpperCase() + option.status.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                {hasFilters && (
                  <button type="button" className="admin-dog-filters-reset" onClick={resetFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {!listError && !isLoadingDogs && dogs.length > 0 && (
              <p className="admin-dogs-count">
                Showing {visibleDogs.length} of {dogs.length} {dogs.length === 1 ? "dog" : "dogs"}
              </p>
            )}

            {listError && (
              <p className="admin-dogs-message admin-dogs-error" role="alert">
                {listError}
              </p>
            )}

            {!listError && isLoadingDogs && (
              <p className="admin-dogs-message" role="status">
                Loading dogs…
              </p>
            )}

            {!listError && !isLoadingDogs && visibleDogs.length === 0 && (
              <p className="admin-dogs-message">
                {hasFilters ? (
                  <>
                    No dogs match those filters.{" "}
                    <button type="button" className="admin-dog-filters-reset" onClick={resetFilters}>
                      Clear filters
                    </button>
                  </>
                ) : (
                  "No dogs yet. Use Add dog to create one."
                )}
              </p>
            )}

            {!listError && !isLoadingDogs && visibleDogs.length > 0 && (
              <div className="admin-dogs-grid">
                {visibleDogs.map((dog) => {
                  const age = calculateAge(dog.date_of_birth);
                  const price = formatPrice(dog.price);
                  const breed = dog.breed ?? "Unknown breed";

                  return (
                    <article key={dog.id} className="admin-dog-card">
                      <div className="admin-dog-image-wrap">
                        <img
                          className="admin-dog-image"
                          src={dog.photo_url ? `${dog.photo_url}&size=card` : logo}
                          alt={dog.name ? `${dog.name}, ${breed}` : breed}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = logo;
                          }}
                        />
                        <span
                          className={`admin-dog-status admin-dog-status-${dog.status ?? "unknown"}`}
                        >
                          {dog.status ?? "No status"}
                        </span>
                      </div>
                      <div className="admin-dog-content">
                        <div className="admin-dog-title">
                          <h3>{dog.name || "Unnamed dog"}</h3>
                          {price && <p className="admin-dog-price">{price}</p>}
                        </div>
                        <p className="admin-dog-breed">{breed}</p>
                        <div className="admin-dog-details">
                          {dog.sex && <span>{dog.sex === "M" ? "Male" : "Female"}</span>}
                          {age && <span>{age}</span>}
                        </div>
                        {dog.description && (
                          <p className="admin-dog-description">{dog.description}</p>
                        )}
                        <div className="admin-dog-actions">
                          <button
                            type="button"
                            className="admin-dog-edit"
                            onClick={() => openEditForm(dog)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="admin-dog-delete"
                            onClick={() => handleDeleteDog(dog)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
};

export default AdminDogs;
