import { useEffect, useState } from "react";
import AvailableDogs from "../../components/availableDogs/availableDogs.tsx";
import {
  auth,
  isAllowedAdminEmail,
  subscribeToAuth,
} from "../../lib/firebase";
import "./adminDogs.css";

interface DogFormState {
  breed_id: number;
  status_id: number;
  name: string;
  date_of_birth: string;
  sex: "M" | "F" | "";
  image_url: string;
  price: string;
  description: string;
}

const emptyFormState: DogFormState = {
  breed_id: 0,
  status_id: 0,
  name: "",
  date_of_birth: "",
  sex: "",
  image_url: "",
  price: "",
  description: "",
};

const AdminDogs = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [dogForm, setDogForm] = useState<DogFormState>(emptyFormState);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDogId, setEditingDogId] = useState<number | null>(null);
  const [statusOptions, setStatusOptions] = useState<{ id: number; status: string }[]>([]);
  const [breedOptions, setBreedOptions] = useState<{ id: number; breed: string }[]>([]);
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

  useEffect(() => {
    const loadDropdowns = async () => {
      try {
        const [statusResponse, breedResponse] = await Promise.all([
          fetch("/api/admin/dog-statuses"),
          fetch("/api/dog-breeds"),
        ]);

        if (statusResponse.ok) {
          const statuses = await statusResponse.json();
          setStatusOptions(statuses);
          if (statuses.length > 0 && dogForm.status_id === 0) {
            setDogForm((current) => ({ ...current, status_id: statuses[0].id }));
          }
        }

        if (breedResponse.ok) {
          const breeds = await breedResponse.json();
          setBreedOptions(breeds);
          if (breeds.length > 0 && dogForm.breed_id === 0) {
            setDogForm((current) => ({ ...current, breed_id: breeds[0].id }));
          }
        }
      } catch (loadError) {
        console.error("Failed to load dog form options:", loadError);
      }
    };

    void loadDropdowns();
  }, [dogForm.breed_id, dogForm.status_id]);

  const openCreateForm = () => {
    setEditingDogId(null);
    setDogForm((current) => ({
      ...emptyFormState,
      breed_id: breedOptions[0]?.id ?? current.breed_id ?? 0,
      status_id: statusOptions[0]?.id ?? current.status_id ?? 0,
    }));
    setError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (dog: {
    id: number;
    breed_id: number;
    status_id?: number;
    name: string | null;
    date_of_birth: string | null;
    sex: "M" | "F" | null;
    image_url: string | null;
    price: string | number | null;
    description: string | null;
  }) => {
    setEditingDogId(dog.id);
    setDogForm({
      breed_id: dog.breed_id ?? breedOptions[0]?.id ?? 0,
      status_id: dog.status_id ?? statusOptions[0]?.id ?? 0,
      name: dog.name ?? "",
      date_of_birth: dog.date_of_birth ?? "",
      sex: dog.sex ?? "",
      image_url: dog.image_url ?? "",
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

    setDogForm((current) => ({
      ...current,
      [name]: name === "breed_id" || name === "status_id" ? Number(value) : value,
    }));
  };

  const handleSaveDog = async () => {
    if (!isAdmin) {
      setError("Admin access is required to save dog records.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const payload = {
        breed_id: dogForm.breed_id,
        status_id: dogForm.status_id,
        name: dogForm.name.trim(),
        date_of_birth: dogForm.date_of_birth || null,
        sex: dogForm.sex || null,
        image_url: dogForm.image_url.trim() || null,
        price: dogForm.price === "" ? null : Number(dogForm.price),
        description: dogForm.description.trim() || null,
      };

      const response = await fetch(
        editingDogId ? `/api/admin/dogs/${editingDogId}` : "/api/admin/dogs",
        {
          method: editingDogId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const result: { error?: string } = await response.json();
        throw new Error(result.error || "Unable to save this dog.");
      }

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

  const handleDeleteDog = async (dogId: number) => {
    if (!isAdmin) {
      return;
    }

    const confirmed = window.confirm("Delete this dog record?");
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/dogs/${dogId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result: { error?: string } = await response.json();
        throw new Error(result.error || "Unable to delete this dog.");
      }

      setRefreshKey((value) => value + 1);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this dog right now.",
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

                <label>
                  <span>Breed</span>
                  <select
                    name="breed_id"
                    value={dogForm.breed_id || ""}
                    onChange={handleFieldChange}
                  >
                    {breedOptions.length === 0 && <option value="">Select breed</option>}
                    {breedOptions.map((breed) => (
                      <option key={breed.id} value={breed.id}>
                        {breed.breed}
                      </option>
                    ))}
                  </select>
                </label>

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

                <label className="admin-form-full">
                  <span>Image URL</span>
                  <input
                    type="url"
                    name="image_url"
                    value={dogForm.image_url}
                    onChange={handleFieldChange}
                    placeholder="https://example.com/image.jpg"
                  />
                </label>

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

              {error && <p className="admin-dog-form-error">{error}</p>}

              <div className="admin-form-actions">
                <button
                  type="button"
                  className="admin-form-cancel"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingDogId(null);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-form-save"
                  onClick={handleSaveDog}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : editingDogId ? "Save changes" : "Add dog"}
                </button>
              </div>
            </section>
          </div>
        )}

        <AvailableDogs
          key={refreshKey}
          adminMode={isAdmin}
          onEditDog={openEditForm}
          onDeleteDog={handleDeleteDog}
        />
      </div>
    </main>
  );
};

export default AdminDogs;
