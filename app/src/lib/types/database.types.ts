// Hand-written to match supabase/migrations/000*.sql until the project is
// linked and `supabase gen types typescript --linked > src/lib/types/database.types.ts`
// can regenerate this file from the live schema.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Role = "learner" | "admin";
type Theme = "light" | "dark";
type CourseStatus = "draft" | "published";
type EnrollmentStatus = "active" | "completed" | "dropped";
type SubmissionStatus = "not_submitted" | "submitted" | "under_review" | "graded";
type EventType =
  | "login"
  | "enrolled"
  | "lesson_opened"
  | "lesson_completed"
  | "quiz_started"
  | "quiz_submitted"
  | "assignment_submitted"
  | "assignment_graded"
  | "resource_downloaded"
  | "module_skipped"
  | "practice_submitted"
  | "peer_review_given";
export type ResourceKind = "read" | "watch" | "docs" | "deeper" | "project";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          avatar_url: string | null;
          role: Role;
          theme: Theme;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          full_name: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      cohorts: {
        Row: {
          id: string;
          name: string;
          start_date: string | null;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["cohorts"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["cohorts"]["Row"]>;
        Relationships: [];
      };
      cohort_members: {
        Row: { id: string; cohort_id: string; user_id: string; created_at: string };
        Insert: Partial<Database["public"]["Tables"]["cohort_members"]["Row"]> & {
          cohort_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["cohort_members"]["Row"]>;
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          title: string;
          slug: string;
          description: string | null;
          thumbnail_url: string | null;
          status: CourseStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["courses"]["Row"]> & {
          title: string;
          slug: string;
        };
        Update: Partial<Database["public"]["Tables"]["courses"]["Row"]>;
        Relationships: [];
      };
      modules: {
        Row: {
          id: string;
          course_id: string;
          title: string;
          description: string | null;
          position: number;
          is_optional: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["modules"]["Row"]> & {
          course_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["modules"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          id: string;
          module_id: string;
          title: string;
          slug: string;
          description: string | null;
          content: string | null;
          video_url: string | null;
          practice: string | null;
          practice_answer: string | null;
          position: number;
          duration_minutes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["lessons"]["Row"]> & {
          module_id: string;
          title: string;
          slug: string;
        };
        Update: Partial<Database["public"]["Tables"]["lessons"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey";
            columns: ["module_id"];
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_resources: {
        Row: {
          id: string;
          lesson_id: string;
          kind: ResourceKind;
          title: string;
          url: string;
          source: string | null;
          note: string | null;
          subscribers: number | null;
          views: number | null;
          likes: number | null;
          published_on: string | null;
          checked_on: string | null;
          duration_minutes: number | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["lesson_resources"]["Row"]> & {
          lesson_id: string;
          kind: ResourceKind;
          title: string;
          url: string;
        };
        Update: Partial<Database["public"]["Tables"]["lesson_resources"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "lesson_resources_lesson_id_fkey";
            columns: ["lesson_id"];
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_responses: {
        Row: {
          id: string;
          lesson_id: string;
          user_id: string;
          response_text: string | null;
          response_url: string | null;
          share_with_peers: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["practice_responses"]["Row"]> & {
          lesson_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["practice_responses"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "practice_responses_lesson_id_fkey";
            columns: ["lesson_id"];
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_reviews: {
        Row: {
          id: string;
          response_id: string;
          reviewer_id: string;
          comment: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["practice_reviews"]["Row"]> & {
          response_id: string;
          reviewer_id: string;
          comment: string;
        };
        Update: Partial<Database["public"]["Tables"]["practice_reviews"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "practice_reviews_response_id_fkey";
            columns: ["response_id"];
            referencedRelation: "practice_responses";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          cohort_id: string | null;
          status: EnrollmentStatus;
          enrolled_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["enrollments"]["Row"]> & {
          user_id: string;
          course_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["enrollments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey";
            columns: ["course_id"];
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_progress: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string;
          completed: boolean;
          skipped: boolean;
          completed_at: string | null;
          last_accessed_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["lesson_progress"]["Row"]> & {
          user_id: string;
          lesson_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["lesson_progress"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey";
            columns: ["lesson_id"];
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      quizzes: {
        Row: {
          id: string;
          lesson_id: string;
          title: string;
          description: string | null;
          passing_score: number;
          max_attempts: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["quizzes"]["Row"]> & {
          lesson_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["quizzes"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "quizzes_lesson_id_fkey";
            columns: ["lesson_id"];
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_questions: {
        Row: {
          id: string;
          quiz_id: string;
          question: string;
          question_type: "single_choice";
          explanation: string | null;
          position: number;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_questions"]["Row"]> & {
          quiz_id: string;
          question: string;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_questions"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey";
            columns: ["quiz_id"];
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_options: {
        Row: {
          id: string;
          question_id: string;
          option_text: string;
          is_correct: boolean;
          position: number;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_options"]["Row"]> & {
          question_id: string;
          option_text: string;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_options"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "quiz_options_question_id_fkey";
            columns: ["question_id"];
            referencedRelation: "quiz_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_attempts: {
        Row: {
          id: string;
          user_id: string;
          quiz_id: string;
          score: number;
          passed: boolean;
          answers: Json;
          attempted_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_attempts"]["Row"]> & {
          user_id: string;
          quiz_id: string;
          score: number;
          passed: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_attempts"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey";
            columns: ["quiz_id"];
            referencedRelation: "quizzes";
            referencedColumns: ["id"];
          },
        ];
      };
      assignments: {
        Row: {
          id: string;
          lesson_id: string;
          title: string;
          description: string | null;
          instructions: string | null;
          deadline: string | null;
          max_score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["assignments"]["Row"]> & {
          lesson_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["assignments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "assignments_lesson_id_fkey";
            columns: ["lesson_id"];
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      assignment_submissions: {
        Row: {
          id: string;
          assignment_id: string;
          user_id: string;
          submission_url: string | null;
          submission_text: string | null;
          status: SubmissionStatus;
          score: number | null;
          feedback: string | null;
          submitted_at: string | null;
          graded_at: string | null;
          graded_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["assignment_submissions"]["Row"]> & {
          assignment_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["assignment_submissions"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey";
            columns: ["assignment_id"];
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          user_id: string | null;
          event_type: EventType;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["events"]["Row"]> & {
          event_type: EventType;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_quiz_attempt: {
        Args: { p_quiz_id: string; p_answers: Json };
        Returns: Json;
      };
      get_peer_practice: {
        Args: { p_lesson_id: string };
        Returns: Json;
      };
      admin_quiz_questions: {
        Args: { p_quiz_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
