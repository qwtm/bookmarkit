import React from "react";

const DeleteConfirmModal = ({ message, onConfirm, onCancel }) => (
  <div className="p-6 text-center bg-primary-bg rounded-lg">
    <h3 className="text-xl font-semibold mb-4 text-primary-text">
      Confirm Deletion
    </h3>
    <p className="text-secondary-text mb-6">{message}</p>
    <div className="flex justify-center space-x-4">
      <button
        onClick={onCancel}
        className="px-6 py-2 bg-secondary-bg text-primary-text border border-border rounded-md hover:bg-border focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transition-colors duration-200"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200"
      >
        Delete
      </button>
    </div>
  </div>
);

export default DeleteConfirmModal;
