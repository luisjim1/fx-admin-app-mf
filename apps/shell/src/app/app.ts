import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
  imports: [RouterOutlet],
})
export class AppComponent implements OnInit, OnDestroy {
  showLoginFooter = false;
  currentYear = new Date().getFullYear();
  private destroyed$ = new Subject<void>();

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntil(this.destroyed$)
      )
      .subscribe((e) => {
  const url = e.urlAfterRedirects || e.url;
  this.showLoginFooter = /^\/login(?:$|[\/?#])/.test(url);
});
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}

