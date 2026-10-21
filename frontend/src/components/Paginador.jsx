import React from 'react';

export const Paginador = ({ 
  page = 1, 
  totalPages = 1, 
  setPage, 
  limit = 20, 
  setLimit = null, 
  totalRegistros = null 
}) => {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const isFirstPage = page <= 1;
  const isLastPage = page >= safeTotalPages;

  return (
    <div className="paginador-container">
      {/* Información de registros y selector de límite */}
      <div className="flex-row">
        {totalRegistros !== null && (
          <span className="font-bold text-muted">
            Total: <strong style={{ color: 'var(--text-main)' }}>{totalRegistros}</strong> {totalRegistros === 1 ? 'registro' : 'registros'}
          </span>
        )}

        {setLimit && (
          <label className="flex-row text-muted" style={{ fontSize: '13px', cursor: 'pointer' }}>
            <span>Mostrar:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="paginador-select"
            >
              <option value={20}>20 por pág.</option>
              <option value={50}>50 por pág.</option>
              <option value={100}>100 por pág.</option>
            </select>
          </label>
        )}
      </div>

      {/* Controles de Navegación */}
      <div className="flex-row">
        <button
          type="button"
          onClick={() => setPage(prev => Math.max(1, prev - 1))}
          disabled={isFirstPage}
          className="paginador-btn"
        >
          &larr; Anterior
        </button>

        <span className="paginador-text">
          Página {page} de {safeTotalPages}
        </span>

        <button
          type="button"
          onClick={() => setPage(prev => Math.min(safeTotalPages, prev + 1))}
          disabled={isLastPage}
          className="paginador-btn"
        >
          Siguiente &rarr;
        </button>
      </div>
    </div>
  );
};

export default Paginador;
