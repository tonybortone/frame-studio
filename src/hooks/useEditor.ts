import { useCallback, useEffect, useRef, useState } from 'react';
import { createProject, parseProject } from '../core/project';
import type { Project } from '../core/types';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('frame-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function useEditor() {
  const [project, setProject] = useState<Project>(createProject);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Opening project');
  const history = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const current = useRef(project);
  const loaded = useRef(false);
  const autosaveBlocked = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  current.current = project;
  useEffect(() => {
    let disposed = false;
    void database()
      .then(
        (db) =>
          new Promise<unknown>((resolve, reject) => {
            const transaction = db.transaction('projects');
            const request = transaction.objectStore('projects').get('current');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
            transaction.onabort = () => {
              db.close();
              reject(transaction.error);
            };
          }),
      )
      .then((value) => {
        if (disposed) return;
        if (value === undefined) return;
        if (typeof value !== 'string')
          throw new Error('The saved project has an unsupported format.');
        const restored = parseProject(value);
        current.current = restored;
        setProject(restored);
      })
      .catch(() => {
        if (disposed) return;
        // Never replace unreadable stored work with the demo scene. Keep the original
        // record untouched so it can be recovered, and allow explicit file saves.
        autosaveBlocked.current = true;
        setSaveStatus('Autosave paused — existing save preserved; save a project file');
      })
      .finally(() => {
        if (!disposed) {
          loaded.current = true;
          setReady(true);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!ready || autosaveBlocked.current) return;
    let canceled = false;
    setSaveStatus('Saving…');
    const timer = window.setTimeout(() => {
      let serialized: string;
      try {
        if (!project.name.trim()) throw new Error('Give the project a name.');
        serialized = JSON.stringify(project);
        // Validate only when the debounce settles, never on each drag update.
        parseProject(serialized);
      } catch (error) {
        setSaveStatus(
          `Autosave paused — ${error instanceof Error ? error.message : 'invalid project data'}`,
        );
        return;
      }
      // Serial writes prevent an older save from completing after a newer one.
      saveQueue.current = saveQueue.current
        .then(async () => {
          if (canceled) return;
          const db = await database();
          if (canceled) {
            db.close();
            return;
          }
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('projects', 'readwrite');
            transaction.objectStore('projects').put(serialized, 'current');
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
            transaction.onabort = () => {
              db.close();
              reject(transaction.error);
            };
          });
          if (!canceled) setSaveStatus('Saved on this device');
        })
        .catch(() => {
          if (!canceled) setSaveStatus('Autosave failed — save a project file');
        });
    }, 800);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [project, ready]);
  const checkpoint = useCallback(() => {
    if (!loaded.current) return;
    history.current.past = [...history.current.past.slice(-39), current.current];
    history.current.future = [];
  }, []);
  const update = useCallback(
    (recipe: (previous: Project) => Project, record = true) => {
      if (!loaded.current) return;
      if (record) checkpoint();
      const next = recipe(current.current);
      current.current = next;
      setProject(next);
    },
    [checkpoint],
  );
  const undo = useCallback(() => {
    if (!loaded.current) return;
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(current.current);
    current.current = previous;
    setProject(previous);
  }, []);
  const redo = useCallback(() => {
    if (!loaded.current) return;
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(current.current);
    current.current = next;
    setProject(next);
  }, []);
  return { project, ready, saveStatus, update, checkpoint, undo, redo };
}
