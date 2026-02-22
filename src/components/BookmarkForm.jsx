import React, { useEffect, useMemo, useState } from "react";
import { createLLM, LLM_PROVIDERS } from "../llm/index.js";

const BookmarkForm = ({
  bookmark,
  onClose,
  onSave,
  onDelete,
  fetchUrlStatus,
}) => {
  const [formData, setFormData] = useState({
    title: bookmark?.title || "",
    url: bookmark?.url || "",
    description: bookmark?.description || "",
    tags: bookmark?.tags ? bookmark.tags.join(", ") : "",
    rating: bookmark?.rating || 0,
    folderId: bookmark?.folderId || "",
    faviconUrl: bookmark?.faviconUrl || "",
  });
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [ignoreUrlValidation, setIgnoreUrlValidation] = useState(
    bookmark?.urlStatus === "ignored",
  );
  const [currentUrlValidity, setCurrentUrlValidity] = useState("checking"); // 'checking', 'valid', 'invalid'
  const [hasUrlInputChanged, setHasUrlInputChanged] = useState(false); // show ignore only after typing

  // Create a single LLM instance using the app's configured provider/options (same pattern as BookmarkApp)
  const llm = useMemo(() => {
    const provider =
      (typeof __llm_provider__ !== "undefined" && __llm_provider__) ||
      LLM_PROVIDERS.GEMINI;
    const options =
      (typeof __llm_options__ !== "undefined" && __llm_options__) || {};
    return createLLM(provider, options);
  }, []);

  // Helpers to normalize LLM text outputs
  const cleanLLMText = (text) => {
    if (!text) return "";
    // Strip markdown code fences and leading labels
    let t = String(text).trim();
    const fenceMatch = t.match(/```[a-zA-Z]*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) t = fenceMatch[1].trim();
    // Remove any leading descriptors like "Description:" or "Tags:"
    t = t.replace(/^\s*(description|tags)\s*:\s*/i, "").trim();
    return t;
  };

  const toCsvTags = (text) => {
    const t = cleanLLMText(text)
      .replace(/[\n|\t]+/g, ",")
      .replace(/\s{2,}/g, " ");
    const parts = t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Deduplicate while preserving order
    const seen = new Set();
    const unique = parts.filter((tag) =>
      seen.has(tag.toLowerCase()) ? false : (seen.add(tag.toLowerCase()), true),
    );
    return unique.join(", ");
  };

  useEffect(() => {
    let isMounted = true; // prevent state updates after unmount
    // If ignoring validation, skip checks
    if (ignoreUrlValidation)
      return () => {
        isMounted = false;
      };

    // Show checking immediately when URL changes or is empty
    setCurrentUrlValidity("checking");

    if (!fetchUrlStatus)
      return () => {
        isMounted = false;
      };

    const url = formData.url;
    const timer = setTimeout(async () => {
      // If no URL, remain in 'checking' state (do not call API)
      if (!url) {
        if (isMounted) setCurrentUrlValidity("checking");
        return;
      }
      try {
        const status = await fetchUrlStatus(url);
        if (isMounted) setCurrentUrlValidity(status);
      } catch {
        if (isMounted) setCurrentUrlValidity("invalid");
      }
    }, 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [fetchUrlStatus, formData.url, ignoreUrlValidation]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "url" && !hasUrlInputChanged) {
      setHasUrlInputChanged(true);
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRatingChange = (newRating) => {
    setFormData((prev) => ({
      ...prev,
      rating: prev.rating === newRating ? 0 : newRating,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const tagsArray = formData.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "");
    onSave({
      ...bookmark,
      ...formData,
      tags: tagsArray,
      urlStatus: ignoreUrlValidation ? "ignored" : currentUrlValidity,
      ignoreUrlValidation,
    });
  };

  const generateDescriptionWithGemini = async () => {
    setIsGeneratingDescription(true);
    const prompt = `Generate a concise description (1-2 sentences) for the following bookmark. Only return the description, no other text.\nTitle: ${formData.title}\nURL: ${formData.url}`;
    try {
      const raw = await llm.generate(prompt);
      const suggested = cleanLLMText(raw);
      if (suggested)
        setFormData((prev) => ({ ...prev, description: suggested }));
    } catch (error) {
      console.error("Error generating description via LLM:", error);
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const generateTagsWithGemini = async () => {
    setIsGeneratingTags(true);
    const prompt = `Given the following bookmark details, suggest 3-8 short, relevant tags as a comma-separated list. Only return the tags, no other text.\nTitle: ${formData.title}\nURL: ${formData.url}\nDescription: ${formData.description}`;
    try {
      const raw = await llm.generate(prompt);
      const csv = toCsvTags(raw);
      if (csv)
        setFormData((prev) => ({
          ...prev,
          tags: prev.tags ? `${prev.tags}, ${csv}` : csv,
        }));
    } catch (error) {
      console.error("Error generating tags via LLM:", error);
    } finally {
      setIsGeneratingTags(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <h2 className="text-2xl font-semibold mb-6 text-primary-text">
        {bookmark ? "Edit Bookmark" : "Add New Bookmark"}
      </h2>
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-primary-text mb-1"
          >
            Title
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-border rounded-md focus:ring-accent focus:border-accent themed-input"
            required
          />
        </div>
        <div>
          <label
            htmlFor="url"
            className="block text-sm font-medium text-primary-text mb-1"
          >
            URL
          </label>
          <input
            type="url"
            id="url"
            name="url"
            value={formData.url}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md focus:ring-accent focus:border-accent themed-input ${
              currentUrlValidity === "invalid" && !ignoreUrlValidation
                ? "border-red-500"
                : "border-border"
            }`}
            required
          />
          {hasUrlInputChanged &&
            (ignoreUrlValidation || currentUrlValidity !== "valid") && (
              <button
                type="button"
                onClick={() => setIgnoreUrlValidation((v) => !v)}
                className={`mt-2 px-3 py-1 text-white text-sm rounded-md transition-colors duration-200 ${
                  ignoreUrlValidation
                    ? "bg-green-500 hover:bg-green-600"
                    : currentUrlValidity === "checking"
                      ? "bg-yellow-500 hover:bg-yellow-600"
                      : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {ignoreUrlValidation ? "Ignored" : "Ignore checking"}
              </button>
            )}
        </div>
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-primary-text mb-1"
          >
            Description
          </label>
          <div className="flex space-x-2">
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              className="w-full px-3 py-2 border border-border rounded-md focus:ring-accent focus:border-accent themed-input"
            ></textarea>
            <button
              type="button"
              onClick={generateDescriptionWithGemini}
              disabled={
                isGeneratingDescription || !formData.url || !formData.title
              }
              className="px-3 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingDescription ? "Generating..." : "Suggest"}
            </button>
          </div>
        </div>
        <div>
          <label
            htmlFor="tags"
            className="block text-sm font-medium text-primary-text mb-1"
          >
            Tags (comma-separated)
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-border rounded-md focus:ring-accent focus:border-accent themed-input"
              placeholder="e.g., development, web, reference"
            />
            <button
              type="button"
              onClick={generateTagsWithGemini}
              disabled={isGeneratingTags || !formData.url || !formData.title}
              className="px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingTags ? "Generating..." : "Suggest"}
            </button>
          </div>
        </div>
        <div>
          <label
            htmlFor="folderId"
            className="block text-sm font-medium text-primary-text mb-1"
          >
            Folder
          </label>
          <input
            type="text"
            id="folderId"
            name="folderId"
            value={formData.folderId}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-border rounded-md focus:ring-accent focus:border-accent themed-input"
            placeholder="e.g., work, personal"
          />
        </div>
        <div>
          <label
            htmlFor="faviconUrl"
            className="block text-sm font-medium text-primary-text mb-1"
          >
            Favicon URL
          </label>
          <input
            type="url"
            id="faviconUrl"
            name="faviconUrl"
            value={formData.faviconUrl}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-border rounded-md focus:ring-accent focus:border-accent themed-input"
            placeholder="e.g., https://example.com/favicon.ico"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-primary-text mb-1">
            Rating
          </label>
          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={`h-6 w-6 cursor-pointer ${star <= formData.rating ? "text-yellow-400" : "text-secondary-text"}`}
                fill="currentColor"
                viewBox="0 0 20 20"
                onClick={() => handleRatingChange(star)}
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.683-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.565-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end space-x-3">
        {bookmark && bookmark.id && (
          <button
            type="button"
            onClick={() => onDelete(bookmark.id)}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-secondary-bg text-primary-text border border-border rounded-md hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
        >
          Save Bookmark
        </button>
      </div>
    </form>
  );
};

export default BookmarkForm;
