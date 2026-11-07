import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import logo from "../../assets/logo.jpg";
import DogInterestModal from "../../components/dogInterestModal/dogInterestModal.tsx";
import "./dogDetail.css";

// GET /api/dogs/:id (server/src/dogShare.ts).
interface PublicDog {
  id: number;
  name: string | null;
  breed: string | null;
  status: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  sex: "M" | "F" | null;
  price: string | null;
  description: string | null;
  photo_url: string | null;
}

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; dog: PublicDog };

const ageText = (dateOfBirth: string | null) => {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  if (Number.isNaN(birth.getTime()) || birth > today) return null;

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years === 0) return months <= 1 ? (months === 1 ? "1 month old" : "Under 1 month old") : `${months} months old`;
  return years === 1 ? "1 year old" : `${years} years old`;
};

const priceText = (price: string | null) => {
  const value = price === null ? NaN : Number(price);
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)
    : null;
};

const STATUS_COPY: Record<string, { label: string; note: string }> = {
  available: { label: "Available", note: "" },
  reserved: { label: "Reserved", note: "Someone has already asked about this dog. Call us to ask about similar dogs." },
  sold: { label: "Found a home", note: "This dog has gone to a new home. Browse our other dogs below." },
};

// Public page for one dog; also where Facebook share links send people.
const DogDetail = () => {
  const { id = "" } = useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [isInterestOpen, setIsInterestOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });

    fetch(`/api/dogs/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as (PublicDog & { error?: string }) | null;
        if (!response.ok || !body) {
          setState({ kind: "error", message: body?.error ?? "We couldn’t find this dog." });
          return;
        }
        setState({ kind: "ready", dog: body });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ kind: "error", message: "We couldn’t load this dog. Please try again." });
        }
      });

    return () => controller.abort();
  }, [id]);

  if (state.kind === "loading") {
    return (
      <main className="dog-detail">
        <p className="dd-message" role="status">
          Loading…
        </p>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="dog-detail">
        <div className="dd-message">
          <h1>Dog not found</h1>
          <p>{state.message}</p>
          <Link className="dd-button dd-button-ghost" to="/all-dogs">
            See all available dogs
          </Link>
        </div>
      </main>
    );
  }

  const { dog } = state;
  const name = dog.name || "Meet your new companion";
  const breed = dog.breed ?? "";
  const status = STATUS_COPY[dog.status ?? ""] ?? { label: dog.status ?? "", note: "" };
  const price = priceText(dog.price);
  const facts = [dog.sex === "M" ? "Male" : dog.sex === "F" ? "Female" : null, ageText(dog.date_of_birth)].filter(
    (fact): fact is string => Boolean(fact),
  );

  return (
    <main className="dog-detail">
      <div className="dd-content">
        <Link className="dd-back" to="/all-dogs">
          ← All dogs
        </Link>

        <article className="dd-layout">
          <div className="dd-photo">
            <img
              src={dog.photo_url ?? logo}
              alt={dog.name ? `${dog.name}, ${breed}` : breed || "Dog photo"}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = logo;
              }}
            />
            {status.label && <span className={`dd-status dd-status-${dog.status ?? "unknown"}`}>{status.label}</span>}
          </div>

          <div className="dd-info">
            {breed && <p className="dd-breed">{breed}</p>}
            <h1>{name}</h1>
            {price && <p className="dd-price">{price}</p>}

            {facts.length > 0 && (
              <div className="dd-facts">
                {facts.map((fact) => (
                  <span key={fact}>{fact}</span>
                ))}
              </div>
            )}

            {dog.description && <p className="dd-description">{dog.description}</p>}

            {dog.status === "available" ? (
              <button type="button" className="dd-button" onClick={() => setIsInterestOpen(true)}>
                I’m interested
              </button>
            ) : (
              <p className="dd-note">{status.note}</p>
            )}
          </div>
        </article>
      </div>

      {isInterestOpen && (
        <DogInterestModal
          dog={{ id: dog.id, name: dog.name, breed }}
          onClose={() => setIsInterestOpen(false)}
        />
      )}
    </main>
  );
};

// Fallback for share links while /share/** isn't routed to the API server
// (and in case a visitor ever lands on the app's version of the link).
export const ShareDogRedirect = () => {
  const { id = "" } = useParams();
  return <Navigate to={`/dogs/${encodeURIComponent(id)}`} replace />;
};

export default DogDetail;
