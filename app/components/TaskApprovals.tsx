/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

// Define what a Task looks like so TypeScript is happy
interface Task {
  id: string;
  name: string;
  description: string;
  photoUrl: string;
  status: string;
}

export default function TaskApprovals() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    // Listen ONLY for tasks that are "Pending Approval"
    const q = query(collection(db, "tasks"), where("status", "==", "Pending Approval"));
    
    // onSnapshot automatically updates the screen when new data arrives
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pendingTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      
      setTasks(pendingTasks);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, {
        status: newStatus
      });
    } catch (error) {
      console.error("Failed to update task", error);
      alert("Failed to update task status.");
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mt-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Task Approval Queue</h2>
      
      {tasks.length === 0 ? (
        <p className="text-gray-500 text-center py-8">🎉 All caught up! No pending tasks.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {tasks.map((task) => (
            <div key={task.id} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              {/* The uploaded photo */}
              <div className="h-48 w-full bg-gray-200">
                <img 
                  src={task.photoUrl} 
                  alt="Task Proof" 
                  className="w-full h-full object-cover"
                />
              </div>
              
              {/* Task Details */}
              <div className="p-4">
                <p className="font-semibold text-gray-900">{task.name}</p>
                <p className="text-gray-600 text-sm mb-4">&quot;{task.description}&quot;</p>                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleUpdateStatus(task.id, "Approved")}
                    className="flex-1 bg-green-100 hover:bg-green-200 text-green-700 font-semibold py-2 rounded-lg transition-colors"
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(task.id, "Rejected")}
                    className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-2 rounded-lg transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}