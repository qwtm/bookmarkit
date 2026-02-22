import React from "react";

const MessageModal = ({ message, type = "info", onClose }) => {
  const bgColor =
    type === "success"
      ? "bg-green-100"
      : type === "error"
        ? "bg-red-100"
        : "bg-accent bg-opacity-10";
  const textColor =
    type === "success"
      ? "text-green-800"
      : type === "error"
        ? "text-red-800"
        : "text-accent";
  const borderColor =
    type === "success"
      ? "border-green-300"
      : type === "error"
        ? "border-red-300"
        : "border-accent border-opacity-30";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`rounded-lg shadow-xl max-w-sm w-full m-4 p-6 border ${bgColor} ${borderColor}`}
      >
        <h3 className={`text-xl font-semibold mb-4 ${textColor}`}>
          {type === "success"
            ? "Success!"
            : type === "error"
              ? "Error!"
              : "Information"}
        </h3>
        <p className={`${textColor} mb-6`}>{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary-bg text-primary-text border border-border rounded-md hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageModal;
