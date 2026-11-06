import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export interface BreedOption {
  id: number;
  breed: string;
}

interface BreedSelectProps {
  options: BreedOption[];
  value: number;
  onChange: (breedId: number) => void;
  // Deletes the breed; rejects with a user-facing message (e.g. breed in use).
  onDelete: (option: BreedOption) => Promise<void>;
  // id of the visible "Breed" label.
  labelledBy: string;
}

// Breed dropdown for the admin dog form: search box at the top of the list and
// a delete button (with an inline confirm) on each breed.
const BreedSelect = ({ options, value, onChange, onDelete, labelledBy }: BreedSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const triggerId = useId();

  const selected = options.find((option) => option.id === value);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? options.filter((option) => option.breed.toLowerCase().includes(search))
      : options;
  }, [options, query]);

  const resetDeleteState = () => {
    setConfirmingId(null);
    setRowError(null);
  };

  const close = (restoreFocus: boolean) => {
    setIsOpen(false);
    setQuery("");
    resetDeleteState();
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const open = () => {
    const selectedIndex = options.findIndex((option) => option.id === value);
    setActiveIndex(Math.max(selectedIndex, 0));
    setIsOpen(true);
  };

  const choose = (option: BreedOption) => {
    onChange(option.id);
    close(true);
  };

  const confirmDelete = async (option: BreedOption) => {
    setDeletingId(option.id);
    setRowError(null);

    try {
      await onDelete(option);
      setConfirmingId(null);
      setActiveIndex((index) => Math.max(0, Math.min(index, filtered.length - 2)));
      searchRef.current?.focus();
    } catch (deleteError) {
      setConfirmingId(null);
      setRowError({
        id: option.id,
        message: deleteError instanceof Error ? deleteError.message : "Could not delete the breed.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Focus the search box on open, and close when clicking anywhere else.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  // Keep the highlighted option visible while arrowing through a long list.
  useEffect(() => {
    if (isOpen) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, activeIndex, listId]);

  // Tabbing from the search box into the delete buttons keeps the list open;
  // focus leaving the whole picker closes it.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (isOpen && !rootRef.current?.contains(event.relatedTarget as Node | null)) {
      close(false);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (filtered[activeIndex] && confirmingId === null) {
          choose(filtered[activeIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        if (confirmingId !== null) {
          setConfirmingId(null);
        } else {
          close(true);
        }
        break;
    }
  };

  return (
    <div className="breed-select" ref={rootRef} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className="breed-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${labelledBy} ${triggerId}`}
        onClick={() => (isOpen ? close(true) : open())}
        onKeyDown={(event) => {
          if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            open();
          }
        }}
      >
        <span className={selected ? undefined : "breed-select-placeholder"}>
          {selected?.breed ?? "Select breed"}
        </span>
        <span className="breed-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="breed-select-popover">
          <input
            ref={searchRef}
            type="search"
            className="breed-select-search"
            placeholder="Search breeds"
            role="combobox"
            aria-label="Search breeds"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              resetDeleteState();
            }}
            onKeyDown={handleSearchKeyDown}
          />

          <ul id={listId} role="listbox" aria-labelledby={labelledBy} className="breed-select-list">
            {filtered.map((option, index) => {
              const isConfirming = confirmingId === option.id;
              const isDeleting = deletingId === option.id;
              const error = rowError?.id === option.id ? rowError.message : null;

              return (
                <li
                  key={option.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.id === value}
                  className={[
                    "breed-select-option",
                    index === activeIndex ? "is-active" : "",
                    option.id === value ? "is-selected" : "",
                    isConfirming ? "is-confirming" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setActiveIndex(index)}
                  // Keep focus in the search box so the click registers before closing.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!isConfirming && !isDeleting) {
                      choose(option);
                    }
                  }}
                >
                  <div className="breed-select-row">
                    <span className="breed-select-name">
                      {isConfirming ? `Delete “${option.breed}”?` : option.breed}
                    </span>

                    {isConfirming ? (
                      <span className="breed-select-confirm">
                        <button
                          type="button"
                          className="breed-select-confirm-delete"
                          disabled={isDeleting}
                          onClick={(event) => {
                            event.stopPropagation();
                            void confirmDelete(option);
                          }}
                        >
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="breed-select-confirm-cancel"
                          disabled={isDeleting}
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmingId(null);
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="breed-select-delete"
                        aria-label={`Delete breed ${option.breed}`}
                        title="Delete breed"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRowError(null);
                          setConfirmingId(option.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {error && (
                    <p className="breed-select-error" role="alert">
                      {error}
                    </p>
                  )}
                </li>
              );
            })}

            {filtered.length === 0 && (
              <li className="breed-select-empty" role="presentation">
                No breeds match “{query.trim()}”
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BreedSelect;
