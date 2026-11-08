import React from 'react';
import { Search } from 'lucide-react';

interface CardWebSearchButtonProps {
  lectureName: string;
  question: string;
  answer: string;
}

export const CardWebSearchButton: React.FC<CardWebSearchButtonProps> = ({ lectureName, question, answer }) => {
  const search = () => {
    const query = [lectureName, question, answer].filter(Boolean).join(' ');
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      className="card-web-search-button"
      aria-label={`Rechercher sur le Web : ${question}`}
      title="Rechercher cette carte sur le Web"
      onClick={search}
    >
      <Search size={17} aria-hidden="true" />
    </button>
  );
};
