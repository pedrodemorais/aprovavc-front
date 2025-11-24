import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private messageSource = new BehaviorSubject<string | null>(null);
  currentMessage = this.messageSource.asObservable();

  setMessage(message: string) {
    console.log("🔔 [NotificationService] Mensagem definida:", message);
    localStorage.setItem('notificationMessage', message); // 🔹 Salva no localStorage
    this.messageSource.next(message);
  }

  clearMessage() {
    console.log("🔕 [NotificationService] Limpando mensagem...");
    localStorage.removeItem('notificationMessage'); // 🔹 Remove do localStorage
    this.messageSource.next(null);
  }
}
