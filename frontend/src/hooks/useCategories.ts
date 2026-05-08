import { useState, useEffect, useCallback } from 'react';
import { Category, CategoriesResponse } from '../types';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

interface UseCategoriesParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useCategories(params: UseCategoriesParams = {}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response: CategoriesResponse = await apiService.getCategories(params);

      setCategories(response.categories);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar categorias';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [params.search, params.page, params.pageSize]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const deleteCategory = useCallback(async (id: string) => {
    try {
      await apiService.deleteCategory(id);
      toast.success('Categoria excluida com sucesso');
      fetchCategories();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir categoria';
      toast.error(errorMessage);
    }
  }, [fetchCategories]);

  const deleteCategoriesBulk = useCallback(async (ids: string[]) => {
    if (!ids.length) return { successCount: 0, failedCount: 0 };

    const results = await Promise.allSettled(ids.map((id) => apiService.deleteCategory(id)));
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failedCount = results.length - successCount;

    if (successCount > 0) {
      toast.success(`${successCount} categoria(s) excluida(s) com sucesso`);
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} categoria(s) nao puderam ser excluidas`);
    }

    fetchCategories();
    return { successCount, failedCount };
  }, [fetchCategories]);

  const refresh = useCallback(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    total,
    totalPages,
    loading,
    error,
    refresh,
    deleteCategory,
    deleteCategoriesBulk,
  };
}