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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      backgroundColor: '#f8f9fa',
      borderTop: '1px solid #e2e8f0',
      borderRadius: '0 0 8px 8px',
      fontSize: '14px',
      color: '#4a5568',
      flexWrap: 'wrap',
      gap: '12px'
    }}>
      {/* Información de registros y selector de límite */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {totalRegistros !== null && (
          <span style={{ fontWeight: '500' }}>
            Total: <strong>{totalRegistros}</strong> {totalRegistros === 1 ? 'registro' : 'registros'}
          </span>
        )}

        {setLimit && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <span>Mostrar:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e0',
                backgroundColor: '#fff',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <option value={20}>20 por pág.</option>
              <option value={50}>50 por pág.</option>
              <option value={100}>100 por pág.</option>
            </select>
          </label>
        )}
      </div>

      {/* Controles de Navegación */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setPage(prev => Math.max(1, prev - 1))}
          disabled={isFirstPage}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #cbd5e0',
            backgroundColor: isFirstPage ? '#edf2f7' : '#fff',
            color: isFirstPage ? '#a0aec0' : '#2d3748',
            cursor: isFirstPage ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            transition: 'all 0.2s ease'
          }}
        >
          &larr; Anterior
        </button>

        <span style={{ fontWeight: '600', color: '#2d3748', minWidth: '90px', textAlign: 'center' }}>
          Página {page} de {safeTotalPages}
        </span>

        <button
          type="button"
          onClick={() => setPage(prev => Math.min(safeTotalPages, prev + 1))}
          disabled={isLastPage}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #cbd5e0',
            backgroundColor: isLastPage ? '#edf2f7' : '#fff',
            color: isLastPage ? '#a0aec0' : '#2d3748',
            cursor: isLastPage ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '13px',
            transition: 'all 0.2s ease'
          }}
        >
          Siguiente &rarr;
        </button>
      </div>
    </div>
  );
};

export default Paginador;
