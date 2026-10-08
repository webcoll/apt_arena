-- ==============================================================================
-- ⚡ APT Arena Supabase Realtime & Database Setup Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. Create Quizzes Table (Optional: for storing custom quizzes across devices)
CREATE TABLE IF NOT EXISTS public.quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  icon TEXT DEFAULT '🎯',
  description TEXT,
  questions JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Tournament Records Table (For saving grand podium & final scores)
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin TEXT NOT NULL,
  quiz_title TEXT,
  total_players INT DEFAULT 0,
  standings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- 4. Public Access Policies for Anon Key (Permit read/write for live tournament clients)
CREATE POLICY "Allow public read access on quizzes"
  ON public.quizzes FOR SELECT USING (true);

CREATE POLICY "Allow public insert/update on quizzes"
  ON public.quizzes FOR ALL USING (true);

CREATE POLICY "Allow public insert on tournaments"
  ON public.tournaments FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on tournaments"
  ON public.tournaments FOR SELECT USING (true);

-- 5. Seed Initial Quizzes
INSERT INTO public.quizzes (id, title, category, icon, description, questions)
VALUES 
(
  'quiz_tech_stars',
  '⚡ Tech & Coding Superstars',
  'Technology',
  '💻',
  'Test your knowledge of programming, web tech, AI, and computing history!',
  '[
    {"id":"q1","question":"Which language is primarily used for structuring modern web pages?","options":["Python","HTML","C++","Java"],"correctIndex":1,"timeLimit":15,"points":1000,"explanation":"HTML provides the fundamental structure of all web documents."},
    {"id":"q2","question":"What does API stand for in software development?","options":["Automated Program Interface","Application Programming Interface","Applied Protocol Integration","Advanced Processing Instruction"],"correctIndex":1,"timeLimit":20,"points":1000,"explanation":"API stands for Application Programming Interface."},
    {"id":"q3","question":"Which company originally created JavaScript in just 10 days in 1995?","options":["Microsoft","Netscape","Sun Microsystems","Apple"],"correctIndex":1,"timeLimit":20,"points":1000,"explanation":"Brendan Eich created JavaScript at Netscape in 1995."},
    {"id":"q4","question":"In Git, what command creates a new branch and switches to it in one step?","options":["git branch -new","git checkout -b <name>","git switch -create","git push --branch"],"correctIndex":1,"timeLimit":20,"points":1000,"explanation":"git checkout -b creates and checks out a new branch."},
    {"id":"q5","question":"What does HTTP status code 404 signify?","options":["Internal Server Error","Unauthorized","Not Found","Bad Gateway"],"correctIndex":2,"timeLimit":15,"points":1000,"explanation":"HTTP 404 indicates the requested server resource was not found."}
  ]'::jsonb
),
(
  'quiz_science_space',
  '🚀 Science & Cosmic Wonders',
  'Science',
  '🪐',
  'Embark on a tour of the cosmos, physics, astronomy, and planetary mysteries!',
  '[
    {"id":"qs1","question":"What is the closest planet to the Sun in our Solar System?","options":["Venus","Mars","Mercury","Earth"],"correctIndex":2,"timeLimit":15,"points":1000,"explanation":"Mercury is the closest planet to the Sun."},
    {"id":"qs2","question":"What is the speed of light in a vacuum (approximately)?","options":["300,000 km/s","150,000 km/s","30,000 km/s","1,000,000 km/s"],"correctIndex":0,"timeLimit":20,"points":1000,"explanation":"Light travels at roughly 300,000 km/second in vacuum."},
    {"id":"qs3","question":"Which gas makes up roughly 78% of Earth atmosphere?","options":["Oxygen","Carbon Dioxide","Nitrogen","Argon"],"correctIndex":2,"timeLimit":15,"points":1000,"explanation":"Nitrogen makes up roughly 78% of the atmosphere."},
    {"id":"qs4","question":"What is the powerhouse organelle of the biological cell?","options":["Ribosome","Mitochondria","Nucleus","Endoplasmic Reticulum"],"correctIndex":1,"timeLimit":15,"points":1000,"explanation":"Mitochondria generate most chemical energy for the cell."}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
