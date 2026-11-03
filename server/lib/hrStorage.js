export const HR_BUCKETS = ['avatars', 'resumes', 'leave_documents', 'handover_documents', 'sop_videos', 'recruitment_documents', 'attendance_photos'];
export function hrFileUrl(bucket, filePath) {
  if (!HR_BUCKETS.includes(bucket)) throw new Error('Unknown HR storage bucket');
  return `/api/hr-files/${bucket}?path=${encodeURIComponent(filePath)}`;
}
