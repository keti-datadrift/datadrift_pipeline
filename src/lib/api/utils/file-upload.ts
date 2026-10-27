import { uploadTasks, UploadTasksOptions } from '@/lib/api/endpoints/projects';

/**
 * File upload utility functions for Label Studio projects
 */

/**
 * Upload multiple files to a Label Studio project
 *
 * @param projectId - The Label Studio project ID
 * @param files - Array of files to upload
 * @param options - Optional upload configuration
 * @returns Promise that resolves when upload is complete
 *
 * @example
 * ```typescript
 * // Basic usage - upload multiple files
 * const files = [file1, file2, file3];
 * await uploadFilesToProject('123', files);
 *
 * // With custom field name
 * await uploadFilesToProject('123', files, {
 *   fieldName: 'documents'
 * });
 *
 * // With additional metadata
 * await uploadFilesToProject('123', files, {
 *   additionalData: {
 *     source: 'batch_import',
 *     priority: 'high',
 *     auto_annotate: true
 *   }
 * });
 * ```
 */
export async function uploadFilesToProject(
  projectId: string,
  files: File[],
  options?: UploadTasksOptions,
): Promise<void> {
  if (!files || files.length === 0) {
    throw new Error('No files provided for upload');
  }

  if (!projectId) {
    throw new Error('Project ID is required');
  }

  return uploadTasks(projectId, files, options);
}

/**
 * Upload a single file to a Label Studio project
 *
 * @param projectId - The Label Studio project ID
 * @param file - File to upload
 * @param options - Optional upload configuration
 * @returns Promise that resolves when upload is complete
 *
 * @example
 * ```typescript
 * // Upload single file
 * await uploadSingleFile('123', file);
 *
 * // Upload with metadata
 * await uploadSingleFile('123', file, {
 *   additionalData: {
 *     category: 'training',
 *     validated: false
 *   }
 * });
 * ```
 */
export async function uploadSingleFile(
  projectId: string,
  file: File,
  options?: UploadTasksOptions,
): Promise<void> {
  return uploadFilesToProject(projectId, [file], options);
}

/**
 * Validate files before upload
 *
 * @param files - Files to validate
 * @param options - Validation options
 * @returns Object with validation results
 *
 * @example
 * ```typescript
 * const validation = validateFiles(files, {
 *   maxFileSize: 10 * 1024 * 1024, // 10MB
 *   allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
 *   maxFiles: 50
 * });
 *
 * if (!validation.isValid) {
 *   console.error('Validation failed:', validation.errors);
 * }
 * ```
 */
export function validateFiles(
  files: File[],
  options: {
    maxFileSize?: number;
    allowedTypes?: string[];
    maxFiles?: number;
  } = {},
): { isValid: boolean; errors: string[]; validFiles: File[] } {
  const {
    maxFileSize = 100 * 1024 * 1024, // 100MB default
    allowedTypes = [],
    maxFiles = Infinity,
  } = options;

  const errors: string[] = [];
  const validFiles: File[] = [];

  if (files.length > maxFiles) {
    errors.push(`Too many files. Maximum allowed: ${maxFiles}`);
  }

  files.forEach((file, index) => {
    const fileErrors: string[] = [];

    // Check file size
    if (file.size > maxFileSize) {
      fileErrors.push(
        `File "${file.name}" is too large (${formatFileSize(file.size)}). Maximum size: ${formatFileSize(maxFileSize)}`,
      );
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      fileErrors.push(
        `File "${file.name}" has unsupported type (${file.type}). Allowed types: ${allowedTypes.join(', ')}`,
      );
    }

    // Check if file name is empty
    if (!file.name || file.name.trim() === '') {
      fileErrors.push(`File at index ${index} has no name`);
    }

    if (fileErrors.length === 0) {
      validFiles.push(file);
    } else {
      errors.push(...fileErrors);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    validFiles,
  };
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Create a progress tracking wrapper for file uploads
 *
 * @param onProgress - Progress callback
 * @returns Wrapped upload function with progress tracking
 *
 * @example
 * ```typescript
 * const uploadWithProgress = withProgress((progress) => {
 *   console.log(`Upload progress: ${progress.percentage}%`);
 *   console.log(`${progress.uploaded}/${progress.total} files uploaded`);
 * });
 *
 * await uploadWithProgress('123', files);
 * ```
 */
export function withProgress(
  onProgress?: (progress: {
    uploaded: number;
    total: number;
    percentage: number;
    currentFile?: string;
  }) => void,
) {
  return async (
    projectId: string,
    files: File[],
    options?: UploadTasksOptions,
  ): Promise<void> => {
    const total = files.length;

    // For now, we upload all files at once since the API handles batching
    // In the future, this could be extended to upload files individually
    // to provide more granular progress updates

    onProgress?.({
      uploaded: 0,
      total,
      percentage: 0,
      currentFile: files[0]?.name,
    });

    try {
      await uploadFilesToProject(projectId, files, options);

      onProgress?.({
        uploaded: total,
        total,
        percentage: 100,
      });
    } catch (error) {
      // Reset progress on error
      onProgress?.({
        uploaded: 0,
        total,
        percentage: 0,
      });
      throw error;
    }
  };
}

/**
 * Batch upload files with retry logic
 *
 * @param projectId - The Label Studio project ID
 * @param files - Files to upload
 * @param options - Upload and retry options
 * @returns Promise that resolves when all uploads complete
 *
 * @example
 * ```typescript
 * await batchUploadWithRetry('123', files, {
 *   maxRetries: 3,
 *   retryDelay: 1000,
 *   batchSize: 10
 * });
 * ```
 */
export async function batchUploadWithRetry(
  projectId: string,
  files: File[],
  options: UploadTasksOptions & {
    maxRetries?: number;
    retryDelay?: number;
    batchSize?: number;
  } = {},
): Promise<void> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    batchSize = 20,
    ...uploadOptions
  } = options;

  // Split files into batches
  const batches: File[][] = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }

  // Upload each batch with retry logic
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    if (!batch || batch.length === 0) continue;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await uploadFilesToProject(projectId, batch, uploadOptions);
        lastError = null;
        break; // Success, move to next batch
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * Math.pow(2, attempt)),
          );
        }
      }
    }

    if (lastError) {
      throw new Error(
        `Failed to upload batch ${batchIndex + 1}/${batches.length} after ${maxRetries + 1} attempts: ${lastError.message}`,
      );
    }
  }
}
