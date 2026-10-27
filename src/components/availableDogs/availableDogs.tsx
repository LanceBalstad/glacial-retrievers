import { type FormEvent, useEffect, useState } from "react";
import logo from "../../assets/logo.jpg";
import "./availableDogs.css";

interface BreedOption {
  id: number;
  breed: string;
}

interface Dog {
  id: number;
  name: string | null;
  breed_id: number;
  status_id?: number;
  breed: string;
  date_of_birth: string | null;
  sex: "M" | "F" | null;
  image_url: string | null;
  price: string | number | null;
  description: string | null;
}

type AgeFilter = "" | "puppy";
type SexFilter = "" | "M" | "F";

interface AvailableDogsProps {
  puppiesOnly?: boolean;
  adminMode?: boolean;
  onEditDog?: (dog: Dog) => void;
  onDeleteDog?: (dogId: number) => void;
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
    if (months === 0) {
      return "Under 1 month old";
    }
    return months === 1 ? "1 month old" : `${months} months old`;
  }

  return years === 1 ? "1 year old" : `${years} years old`;
};

const DogCard = ({
  dog,
  adminMode = false,
  onEditDog,
  onDeleteDog,
  onInterestClick,
}: {
  dog: Dog;
  adminMode?: boolean;
  onEditDog?: (dog: Dog) => void;
  onDeleteDog?: (dogId: number) => void;
  onInterestClick?: (dog: Dog) => void;
}) => {
  const numericPrice = dog.price === null ? null : Number(dog.price);
  const age = calculateAge(dog.date_of_birth);
  const price =
    numericPrice !== null && Number.isFinite(numericPrice)
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        }).format(numericPrice)
      : null;

  return (
    <article className="available-dog-card">
      <div className="available-dog-image-wrap">
        <img
          className="available-dog-image"
          src={dog.image_url || logo}
          alt={dog.name ? `${dog.name}, ${dog.breed}` : dog.breed}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = logo;
          }}
        />
        <span className="available-dog-status">Available</span>
      </div>
      <div className="available-dog-content">
        <div className="available-dog-heading">
          <h3>{dog.name || "Meet your new companion"}</h3>
          {price && <p className="available-dog-price">{price}</p>}
        </div>
        <p className="available-dog-breed">{dog.breed}</p>
        <div className="available-dog-details">
          {dog.sex && <span>{dog.sex === "M" ? "Male" : "Female"}</span>}
          {age && <span>{age}</span>}
        </div>
        {dog.description && (
          <p className="available-dog-description">{dog.description}</p>
        )}

        {adminMode && (
          <div className="admin-dog-actions">
            <button
              type="button"
              className="admin-dog-edit"
              onClick={() => onEditDog?.(dog)}
            >
              Edit
            </button>
            <button
              type="button"
              className="admin-dog-delete"
              onClick={() => onDeleteDog?.(dog.id)}
            >
              Delete
            </button>
          </div>
        )}

        {!adminMode && (
          <button
            className="available-dog-interest"
            type="button"
            onClick={() => onInterestClick?.(dog)}
          >
            I’m interested
          </button>
        )}
      </div>
    </article>
  );
};

const AvailableDogs = ({
  puppiesOnly = false,
  adminMode = false,
  onEditDog,
  onDeleteDog,
}: AvailableDogsProps) => {
  const [breeds, setBreeds] = useState<BreedOption[]>([]);
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [breedId, setBreedId] = useState("");
  const [sex, setSex] = useState<SexFilter>("");
  const [age, setAge] = useState<AgeFilter>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breedError, setBreedError] = useState<string | null>(null);
  const [interestDog, setInterestDog] = useState<Dog | null>(null);
  const [interestFirstName, setInterestFirstName] = useState("");
  const [interestLastName, setInterestLastName] = useState("");
  const [interestPhone, setInterestPhone] = useState("");
  const [interestEmail, setInterestEmail] = useState("");
  const [interestStatus, setInterestStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [interestMessage, setInterestMessage] = useState("");

  useEffect(() => {
    if (puppiesOnly) {
      return;
    }

    const controller = new AbortController();

    const loadBreeds = async () => {
      try {
        const response = await fetch("/api/dog-breeds", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Could not load breed filters.");
        }
        const breedOptions: BreedOption[] = await response.json();
        setBreeds(breedOptions);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setBreedError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load breed filters.",
          );
        }
      }
    };

    void loadBreeds();
    return () => controller.abort();
  }, [puppiesOnly]);

  useEffect(() => {
    const controller = new AbortController();

    const loadDogs = async () => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      const selectedAge = puppiesOnly ? "puppy" : age;
      if (breedId && !puppiesOnly) {
        params.set("breedId", breedId);
      }
      if (sex && !puppiesOnly) {
        params.set("sex", sex);
      }
      if (selectedAge) {
        params.set("age", selectedAge);
      }

      try {
        const query = params.size > 0 ? `?${params.toString()}` : "";
        const response = await fetch(`/api/dogs${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const result: { error?: string } = await response.json();
          throw new Error(result.error || "Could not load available dogs.");
        }
        const availableDogs: Dog[] = await response.json();
        setDogs(availableDogs);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load available dogs.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadDogs();
    return () => controller.abort();
  }, [breedId, sex, age, puppiesOnly]);

  const resetFilters = () => {
    setBreedId("");
    setSex("");
    setAge("");
  };

  const handleInterestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (!interestDog) {
      return;
    }

    event.preventDefault();
    setInterestStatus("submitting");
    setInterestMessage("");

    try {
      const submittedFirstName = interestFirstName.trim();
      const submittedLastName = interestLastName.trim();
      const submittedPhone = interestPhone.trim();

      if (!submittedFirstName || !submittedLastName || !submittedPhone) {
        throw new Error("Please enter your first name, last name, and phone number.");
      }

      const submittedFullName = `${submittedFirstName} ${submittedLastName}`.trim();
      const description = `${submittedFullName} is interested in ${interestDog.name || "this dog"} ${interestDog.breed}`;

      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "interested_in_dog",
          event_status: "requested",
          start_date: new Date().toISOString().slice(0, 10),
          details: {
            dog_id: interestDog.id,
            dog_name: interestDog.name,
            dog_breed: interestDog.breed,
            customer_first_name: submittedFirstName,
            customer_last_name: submittedLastName,
            customer_phone: submittedPhone,
            customer_email: interestEmail.trim(),
            description,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit your interest request.");
      }

      setInterestStatus("success");
      setInterestMessage("Thanks! We’ve saved your interest and will be in touch.");
      setInterestFirstName("");
      setInterestLastName("");
      setInterestPhone("");
      setInterestEmail("");
      setInterestDog(null);
    } catch (submitError) {
      setInterestStatus("error");
      setInterestMessage(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong while submitting your interest.",
      );
    }
  };

  return (
    <section
      className="available-dogs-section"
      aria-label={puppiesOnly ? "Available puppies" : "Available dogs"}
    >
      <div className="available-dogs-toolbar">
        <div>
          <p className="available-dogs-eyebrow">
            {puppiesOnly ? "Meet the little ones" : "Our dogs"}
          </p>
          <h2>{puppiesOnly ? "Puppies available now" : "Available now"}</h2>
        </div>
        {!puppiesOnly && (
          <div className="dog-filters" aria-label="Filter available dogs">
            <label>
              <span>Breed</span>
              <select
                value={breedId}
                onChange={(event) => setBreedId(event.target.value)}
              >
                <option value="">All breeds</option>
                {breeds.map((breed) => (
                  <option key={breed.id} value={breed.id}>
                    {breed.breed}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Gender</span>
              <select
                value={sex}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "" || value === "M" || value === "F") {
                    setSex(value);
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
                value={age}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "" || value === "puppy") {
                    setAge(value);
                  }
                }}
              >
                <option value="">All ages</option>
                <option value="puppy">Puppy (under 1 year)</option>
              </select>
            </label>
            {(breedId || sex || age) && (
              <button
                className="dog-filters-reset"
                type="button"
                onClick={resetFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {breedError && !puppiesOnly && (
        <p className="dogs-filter-warning" role="status">
          {breedError} Breed filtering may be unavailable.
        </p>
      )}

      {error && (
        <div className="dogs-message dogs-error" role="alert">
          <h2>We couldn’t load the {puppiesOnly ? "puppies" : "dogs"}</h2>
          <p>
            {error} Please check that the API and database are running, then
            try again.
          </p>
        </div>
      )}

      {!error && isLoading && (
        <p className="dogs-message" role="status">
          Loading {puppiesOnly ? "available puppies" : "available dogs"}…
        </p>
      )}

      {!error && !isLoading && dogs.length === 0 && (
        <div className="dogs-message dogs-empty">
          <h2>
            {puppiesOnly
              ? "No puppies are available right now"
              : "No dogs match those filters"}
          </h2>
          <p>
            {puppiesOnly
              ? "Please check back soon or get in touch to ask about upcoming litters."
              : "Try adjusting your filters to see more available dogs."}
          </p>
          {!puppiesOnly && (
            <button type="button" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {!error && !isLoading && dogs.length > 0 && (
        <>
          <p className="dogs-result-count">
            {dogs.length} {dogs.length === 1 ? "dog" : "dogs"} available
          </p>
          <div className="available-dogs-grid">
            {dogs.map((dog) => (
              <DogCard
                key={dog.id}
                dog={dog}
                adminMode={adminMode}
                onEditDog={onEditDog}
                onDeleteDog={onDeleteDog}
                onInterestClick={setInterestDog}
              />
            ))}
          </div>
        </>
      )}

      {interestDog && (
        <div className="interest-modal-backdrop" onClick={() => setInterestDog(null)}>
          <div
            className="interest-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="interest-dog-title"
          >
            <div className="interest-modal-header">
              <h3 id="interest-dog-title">I’m interested in {interestDog.name || "this dog"}</h3>
              <button
                type="button"
                className="interest-modal-close"
                aria-label="Close interested form"
                onClick={() => setInterestDog(null)}
              >
                ×
              </button>
            </div>

            <p className="interest-modal-copy">
              {interestDog.name} · {interestDog.breed}
            </p>

            <form className="interest-form" onSubmit={handleInterestSubmit}>
              <label>
                <span>First name</span>
                <input
                  type="text"
                  value={interestFirstName}
                  onChange={(event) => setInterestFirstName(event.target.value)}
                  placeholder="Your first name"
                  required
                />
              </label>

              <label>
                <span>Last name</span>
                <input
                  type="text"
                  value={interestLastName}
                  onChange={(event) => setInterestLastName(event.target.value)}
                  placeholder="Your last name"
                  required
                />
              </label>

              <label>
                <span>Phone number</span>
                <input
                  type="tel"
                  value={interestPhone}
                  onChange={(event) => setInterestPhone(event.target.value)}
                  placeholder="(555) 123-4567"
                  required
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={interestEmail}
                  onChange={(event) => setInterestEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <button type="submit" disabled={interestStatus === "submitting"}>
                {interestStatus === "submitting" ? "Submitting..." : "Submit interest"}
              </button>

              {interestMessage && (
                <p
                  className={`interest-form-message ${interestStatus}`}
                  role="status"
                >
                  {interestMessage}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default AvailableDogs;
